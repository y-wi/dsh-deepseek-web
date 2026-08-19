/** Duck-typed Harness persistence and workspace seams. Official packages stay optional peers. */

export const SESSION_FORMAT_VERSION = 0

export interface SessionHeaderLike {
  version: number
  id: string
  createdAt: number
  cwd?: string
  parentSession?: string
  seedLength?: number
  origin?: 'subagent'
  agentPreset?: string
}

export interface SessionEventLike {
  type: string
  seq: number
  time: number
  data: unknown
  surfaceOp?: 'append' | 'replace'
  sourceEventSeqs?: number[]
  ignorable?: boolean
}

export interface SessionInspectionLike {
  meta: SessionHeaderLike
  events: readonly SessionEventLike[]
}

export interface SessionPersistenceLike {
  create(meta: SessionHeaderLike): Promise<void>
  append(id: string, events: readonly SessionEventLike[]): Promise<void>
  list(signal?: AbortSignal): Promise<SessionHeaderLike[]>
  inspect(id: string, signal?: AbortSignal): Promise<SessionInspectionLike>
  listSnapshots?(signal?: AbortSignal): Promise<Array<{ header: SessionHeaderLike }>>
}

export interface WorkspaceLike {
  readonly id: string
  readonly path: string
  readonly title: string
  attachSession(sessionId: string): Promise<void>
  setTitle?(title: string): Promise<void>
}

export interface WorkspaceRegistryLike {
  get(id: string): WorkspaceLike | undefined
  list(): WorkspaceLike[]
  create?(path: string, title?: string): Promise<WorkspaceLike>
  resolveByPath?(path: string): Promise<WorkspaceLike | undefined>
  readonly archivedSessionIds?: readonly string[]
}

/** Live SessionStore append used when a mirror is already attached. */
export interface LiveSessionLike {
  readonly id: string
  readonly header?: { cwd?: string }
  append(
    type: string,
    data: unknown,
    opts?: { surfaceOp?: 'append' | 'replace'; sourceEventSeqs?: number[] },
  ): unknown
}

export interface SessionStoreLike {
  get(id: string): LiveSessionLike | undefined
}

export interface PromptScopeLike {
  variable(name: string, provider: () => string | undefined): unknown
}

export interface AgentHandleLike {
  readonly session: LiveSessionLike
  readonly ctx?: { systemPrompt?: PromptScopeLike }
}

export interface AgentSetupContextLike {
  readonly agent?: AgentHandleLike
  readonly systemPrompt?: PromptScopeLike
}

export interface AgentPresetsLike {
  mount(agentCtx: unknown, id?: string): Promise<unknown>
}

export interface AgentRegistryLike {
  get(id: string): AgentHandleLike | undefined
  resume(options: {
    resumeSessionId: string
    setup?: (agentCtx: AgentSetupContextLike) => unknown
  }): Promise<{ agent: AgentHandleLike }>
}

/**
 * Newest `agent-preset/selected` wins; otherwise the creation header. Matches
 * Harness `resolveSessionPreset` so a fork/resume rebuilds the same agent.
 */
export function resolveSessionPreset(session: {
  header?: { agentPreset?: string }
  meta?: { agentPreset?: string }
  events: readonly SessionEventLike[]
}): string | undefined {
  for (let index = session.events.length - 1; index >= 0; index--) {
    const event = session.events[index]
    if (event?.type !== 'agent-preset/selected') continue
    const id = (event.data as { agentPreset?: unknown }).agentPreset
    if (typeof id === 'string' && id.length > 0) return id
  }
  const fromHeader = session.header?.agentPreset ?? session.meta?.agentPreset
  return typeof fromHeader === 'string' && fromHeader.length > 0 ? fromHeader : undefined
}

export class PluginSessionError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'PluginSessionError'
    this.code = code
  }
}
