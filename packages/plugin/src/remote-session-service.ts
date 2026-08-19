import { DeepSeekWebError, ERROR_CODES as COMPAT_CODES, type DeepSeekRemoteSessionHistory, type DeepSeekRemoteSessionPage, type DeepSeekWebClient } from '@dsh-deepseek-web/compat'
import type { DeepSeekWebService } from './service.ts'
import { RemoteSessionCache } from './remote-session-cache.ts'
import { RemoteSessionMaterializer, type MaterializeRemoteSessionResult } from './session-materializer.ts'
import { WorkspaceForkService, type ForkToWorkspaceInput, type ForkToWorkspaceResult } from './workspace-fork.ts'
import {
  PluginSessionError,
  resolveSessionPreset,
  type AgentPresetsLike,
  type AgentRegistryLike,
  type SessionPersistenceLike,
  type SessionStoreLike,
  type WorkspaceLike,
  type WorkspaceRegistryLike,
} from './dsh-session.ts'
import { ERROR_CODES } from './errors.ts'
import { ensureHarnessSessionAttached } from './session-publisher.ts'
import { ensureDeepSeekChatWorkspace } from './deepseek-chat-workspace.ts'

export class RemoteSessionService {
  readonly cache = new RemoteSessionCache()
  readonly materializer: RemoteSessionMaterializer
  readonly forks: WorkspaceForkService
  private chatWorkspace: WorkspaceLike | undefined
  private chatWorkspacePath: string | undefined

  constructor(private readonly deps: {
    auth: DeepSeekWebService
    client: DeepSeekWebClient
    persistence: () => SessionPersistenceLike | undefined
    workspaces: () => WorkspaceRegistryLike | undefined
    agents?: () => AgentRegistryLike | undefined
    sessions?: () => SessionStoreLike | undefined
    agentPresets?: () => AgentPresetsLike | undefined
    home?: () => string
    cwd?: () => string | undefined
    ensureCwd?: (path: string) => Promise<void>
  }) {
    this.materializer = new RemoteSessionMaterializer(deps.persistence, id => {
      return deps.sessions?.()?.get(id) ?? deps.agents?.()?.get(id)?.session
    }, {
      cwd: () => this.chatWorkspacePath ?? deps.cwd?.(),
      cwdAliases: () => {
        const primary = this.chatWorkspacePath
        const raw = deps.cwd?.()
        return raw !== undefined && raw.length > 0 && (primary === undefined || raw !== primary)
          ? [raw]
          : []
      },
      ensureCwd: deps.ensureCwd,
      excludeSessionIds: () => deps.workspaces?.()?.archivedSessionIds ?? [],
      attach: async sessionId => {
        await this.chatWorkspace?.attachSession(sessionId)
      },
    })
    this.forks = new WorkspaceForkService({
      persistence: deps.persistence,
      workspaces: deps.workspaces,
      accountHash: async () => {
        const status = await deps.auth.status()
        return status.status === 'signed-in' ? status.account.accountHash : undefined
      },
    })
  }

  clear(): void {
    this.cache.clear()
  }

  async requireCredential(): Promise<{ token: string; accountHash: string }> {
    const status = await this.deps.auth.status()
    if (status.status !== 'signed-in') {
      throw new PluginSessionError('Sign in to DeepSeek Web to browse conversations', COMPAT_CODES.MISSING_CREDENTIAL)
    }
    const token = await this.deps.auth.resolveToken()
    if (token === undefined || token.length === 0) {
      throw new PluginSessionError('Sign in to DeepSeek Web to browse conversations', COMPAT_CODES.MISSING_CREDENTIAL)
    }
    return { token, accountHash: status.account.accountHash }
  }

  async listSessions(options?: {
    cursor?: string
    limit?: number
    refresh?: boolean
    signal?: AbortSignal
  }): Promise<DeepSeekRemoteSessionPage> {
    const { token, accountHash } = await this.requireCredential()
    if (options?.refresh === true) this.cache.invalidateList(accountHash)
    else {
      const cached = this.cache.getList<DeepSeekRemoteSessionPage>(accountHash)
      if (cached !== undefined && options?.cursor === undefined) return cached
    }
    return this.cache.singleFlight('list', `${accountHash}:${options?.cursor ?? ''}:${options?.limit ?? ''}`, async () => {
      try {
        const page = await this.deps.client.listSessions(token, {
          cursor: options?.cursor,
          limit: options?.limit,
          signal: options?.signal,
        })
        if (options?.cursor === undefined) this.cache.setList(accountHash, page)
        return page
      } catch (error) {
        throw mapRemoteError(error, ERROR_CODES.REMOTE_SESSION_LIST_FAILED)
      }
    })
  }

  async fetchHistory(chatSessionId: string, options?: { refresh?: boolean; signal?: AbortSignal }): Promise<DeepSeekRemoteSessionHistory> {
    const { token, accountHash } = await this.requireCredential()
    if (options?.refresh === true) this.cache.invalidateHistory(accountHash, chatSessionId)
    else {
      const cached = this.cache.getHistory<DeepSeekRemoteSessionHistory>(accountHash, chatSessionId)
      if (cached !== undefined) return cached
    }
    return this.cache.singleFlight('history', this.cache.historyKey(accountHash, chatSessionId), async () => {
      try {
        const history = await this.deps.client.fetchSessionHistory(token, chatSessionId, { signal: options?.signal })
        this.cache.setHistory(accountHash, chatSessionId, history)
        return history
      } catch (error) {
        throw mapRemoteError(error, ERROR_CODES.REMOTE_SESSION_HISTORY_FAILED)
      }
    })
  }

  async materialize(chatSessionId: string): Promise<MaterializeRemoteSessionResult> {
    const { accountHash } = await this.requireCredential()
    return this.cache.singleFlight('materialize', this.cache.mirrorKey(accountHash, chatSessionId), async () => {
      await this.ensureChatWorkspace()
      const history = await this.fetchHistory(chatSessionId, { refresh: true })
      const result = await this.materializer.materialize({
        accountHash,
        remote: history,
        cachedSessionId: this.cache.getMirror(accountHash, chatSessionId),
      })
      await ensureHarnessSessionAttached({
        sessionId: result.sessionId,
        agents: this.deps.agents?.(),
        sessions: this.deps.sessions?.(),
        cwd: this.chatWorkspacePath ?? this.deps.cwd?.(),
        agentPresets: this.deps.agentPresets?.(),
      })
      this.cache.setMirror(accountHash, chatSessionId, result.sessionId)
      return result
    })
  }

  async fork(input: ForkToWorkspaceInput): Promise<ForkToWorkspaceResult> {
    const key = this.cache.forkKey(input.sourceSessionId, input.messageId, input.workspaceId)
    return this.cache.singleFlight('fork', key, async () => {
      await this.ensureChatWorkspace()
      const result = await this.forks.fork(input, this.cache.getFork(key))
      this.cache.rememberFork(key, result.childSessionId)
      const workspace = this.deps.workspaces?.()?.get(input.workspaceId)
      let agentPreset: string | undefined
      try {
        const child = await this.deps.persistence()?.inspect(result.childSessionId)
        if (child !== undefined) agentPreset = resolveSessionPreset(child)
      } catch {
        /* resume still mounts the deployment default */
      }
      await ensureHarnessSessionAttached({
        sessionId: result.childSessionId,
        agents: this.deps.agents?.(),
        sessions: this.deps.sessions?.(),
        cwd: workspace?.path,
        agentPresets: this.deps.agentPresets?.(),
        agentPreset,
      })
      return result
    })
  }

  private async ensureChatWorkspace(): Promise<void> {
    const home = this.deps.home?.()
    if (home === undefined) return
    const ensured = await ensureDeepSeekChatWorkspace({
      home,
      workspaces: this.deps.workspaces?.(),
    })
    this.chatWorkspacePath = ensured.path
    this.chatWorkspace = ensured.workspace
    if (this.chatWorkspace === undefined && ensured.id !== undefined) {
      this.chatWorkspace = this.deps.workspaces?.()?.get(ensured.id)
    }
  }
}

function mapRemoteError(error: unknown, fallback: string): PluginSessionError {
  if (error instanceof PluginSessionError) return error
  if (error instanceof DeepSeekWebError) {
    if (error.code === COMPAT_CODES.REMOTE_SESSION) {
      return new PluginSessionError('that DeepSeek Web conversation was not found', ERROR_CODES.REMOTE_SESSION_NOT_FOUND)
    }
    return new PluginSessionError(error.message, error.code)
  }
  return new PluginSessionError(error instanceof Error ? error.message : String(error), fallback)
}
