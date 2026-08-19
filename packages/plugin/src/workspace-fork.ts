import { readReplay } from './replay.ts'
import {
  PluginSessionError,
  SESSION_FORMAT_VERSION,
  resolveSessionPreset,
  type SessionEventLike,
  type SessionPersistenceLike,
  type WorkspaceRegistryLike,
} from './dsh-session.ts'
import { ERROR_CODES } from './errors.ts'
import { PROVIDER } from './config.ts'

export interface ForkToWorkspaceInput {
  sourceSessionId: string
  messageId: string
  workspaceId: string
}

export interface ForkToWorkspaceResult {
  childSessionId: string
  reused: boolean
}

export function assistantEventIndex(events: readonly SessionEventLike[], messageId: string): number {
  return events.findIndex(event => {
    if (event.type !== 'assistant/message') return false
    const message = (event.data as { message?: { id?: string } }).message
    return message?.id === messageId
  })
}

export function enclosingCompletedTurnEnd(
  events: readonly SessionEventLike[],
  assistantIndex: number,
): number {
  const assistant = events[assistantIndex]
  if (assistant === undefined || assistant.type !== 'assistant/message') {
    throw new PluginSessionError('fork message is not a finalized assistant turn', ERROR_CODES.FORK_MESSAGE_NOT_FOUND)
  }
  const turn = (assistant.data as { turn?: number }).turn
  if (typeof turn !== 'number') {
    throw new PluginSessionError('fork message is missing a turn boundary', ERROR_CODES.FORK_OPEN_TURN)
  }
  for (let index = assistantIndex; index < events.length; index++) {
    const event = events[index]!
    if (event.type !== 'turn/end') continue
    const data = event.data as { turn?: number; reason?: { kind?: string } }
    if (data.turn !== turn) continue
    if (data.reason?.kind !== 'completed') {
      throw new PluginSessionError('cannot fork an incomplete turn', ERROR_CODES.FORK_OPEN_TURN)
    }
    return index
  }
  throw new PluginSessionError('cannot fork an incomplete turn', ERROR_CODES.FORK_OPEN_TURN)
}

export function cutSeedAtTurnEnd(events: readonly SessionEventLike[], endIndex: number): SessionEventLike[] {
  return events.slice(0, endIndex + 1).map((event, seq) => ({ ...event, seq }))
}

export function forkEligibility(events: readonly SessionEventLike[], messageId: string): ForkCutMeta {
  const index = assistantEventIndex(events, messageId)
  if (index < 0) {
    throw new PluginSessionError('fork message was not found', ERROR_CODES.FORK_MESSAGE_NOT_FOUND)
  }
  const message = (events[index]!.data as {
    message?: { source?: { provider?: string; replayState?: unknown } }
  }).message
  const replay = message?.source?.provider === PROVIDER ? readReplay(message.source.replayState) : undefined
  const endIndex = enclosingCompletedTurnEnd(events, index)
  return { replay, endIndex, index }
}

export interface ForkCutMeta {
  replay?: { affinity: { accountHash: string }; remote: { chatSessionId: string }; dshSessionId?: string }
  index: number
  endIndex: number
}

export class WorkspaceForkService {
  constructor(private readonly deps: {
    persistence: () => SessionPersistenceLike | undefined
    workspaces: () => WorkspaceRegistryLike | undefined
    accountHash: () => Promise<string | undefined>
  }) {}

  async fork(input: ForkToWorkspaceInput, cachedChildId?: string): Promise<ForkToWorkspaceResult> {
    const persistence = this.deps.persistence()
    const workspaces = this.deps.workspaces()
    if (persistence === undefined || workspaces === undefined) {
      throw new PluginSessionError(
        'session persistence or workspace registry is unavailable',
        ERROR_CODES.MIRROR_UNAVAILABLE,
      )
    }
    const workspace = workspaces.get(input.workspaceId)
    if (workspace === undefined) {
      throw new PluginSessionError('the selected workspace was not found', ERROR_CODES.FORK_WORKSPACE_NOT_FOUND)
    }
    if (workspace.path.length === 0) {
      throw new PluginSessionError('the selected workspace is no longer available', ERROR_CODES.FORK_WORKSPACE_NOT_FOUND)
    }
    let source
    try {
      source = await persistence.inspect(input.sourceSessionId)
    } catch {
      throw new PluginSessionError('the source conversation was not found', ERROR_CODES.FORK_SOURCE_NOT_FOUND)
    }
    if (source.meta.origin === 'subagent') {
      throw new PluginSessionError('cannot fork a subagent session', ERROR_CODES.FORK_INCOMPATIBLE_SESSION)
    }
    const eligibility = forkEligibility(source.events, input.messageId)
    if (eligibility.replay !== undefined) {
      const accountHash = await this.deps.accountHash()
      if (accountHash !== undefined && eligibility.replay.affinity.accountHash !== accountHash) {
        throw new PluginSessionError(
          'Fork requires the same DeepSeek Web account that created this conversation',
          ERROR_CODES.FORK_MESSAGE_NOT_DEEPSEEK_WEB,
        )
      }
    }
    const seed = cutSeedAtTurnEnd(source.events, eligibility.endIndex)
    const agentPreset = resolveSessionPreset(source)
    const archived = new Set(workspaces.archivedSessionIds ?? [])
    const existing = await findExistingFork(
      persistence,
      input.sourceSessionId,
      workspace.path,
      seed.length,
      cachedChildId,
      archived,
    )
    if (existing !== undefined) {
      await attachFork(workspace, existing)
      return { childSessionId: existing, reused: true }
    }
    const childId = crypto.randomUUID()
    await persistence.create({
      version: SESSION_FORMAT_VERSION,
      id: childId,
      createdAt: Date.now(),
      cwd: workspace.path,
      parentSession: input.sourceSessionId,
      seedLength: seed.length,
      ...(agentPreset === undefined ? {} : { agentPreset }),
    })
    if (seed.length > 0) await persistence.append(childId, seed)
    await attachFork(workspace, childId)
    return { childSessionId: childId, reused: false }
  }
}

const MAX_FORK_INSPECT = 256

async function findExistingFork(
  persistence: SessionPersistenceLike,
  sourceSessionId: string,
  cwd: string,
  seedLength: number,
  cachedId?: string,
  excludeIds: ReadonlySet<string> = new Set(),
): Promise<string | undefined> {
  if (cachedId !== undefined && !excludeIds.has(cachedId)) {
    const hit = await forkMatches(persistence, cachedId, sourceSessionId, cwd, seedLength)
    if (hit) return cachedId
  }
  const headers = await persistence.list()
  const candidates = headers
    .filter(header =>
      header.origin !== 'subagent'
      && !excludeIds.has(header.id)
      && header.parentSession === sourceSessionId
      && header.cwd === cwd
      && header.seedLength === seedLength
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_FORK_INSPECT)
  for (const header of candidates) {
    if (await forkMatches(persistence, header.id, sourceSessionId, cwd, seedLength)) return header.id
  }
  return undefined
}

async function forkMatches(
  persistence: SessionPersistenceLike,
  id: string,
  sourceSessionId: string,
  cwd: string,
  seedLength: number,
): Promise<boolean> {
  try {
    const existing = await persistence.inspect(id)
    return existing.meta.parentSession === sourceSessionId
      && existing.meta.cwd === cwd
      && existing.meta.seedLength === seedLength
      && existing.events.length === seedLength
  } catch {
    return false
  }
}

async function attachFork(workspace: { attachSession(sessionId: string): Promise<void> }, sessionId: string): Promise<void> {
  try {
    await workspace.attachSession(sessionId)
  } catch (error) {
    throw new PluginSessionError(
      error instanceof Error ? error.message : 'failed to attach the forked session',
      ERROR_CODES.FORK_WORKSPACE_ATTACH_FAILED,
    )
  }
}
