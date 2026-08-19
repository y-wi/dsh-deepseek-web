import {
  PluginSessionError,
  type AgentPresetsLike,
  type AgentRegistryLike,
  type AgentSetupContextLike,
  type PromptScopeLike,
  type SessionStoreLike,
} from './dsh-session.ts'
import { ERROR_CODES } from './errors.ts'

/**
 * Harness `session.list` only merges cold persistence rows that have a cwd.
 * Mirrors must be live in SessionStore (and preferably have an Agent) or the
 * client never sees them — `open()` then times out with
 * "the conversation is not yet visible in Harness".
 *
 * Official resume publishes the persisted log into SessionStore and mounts the
 * agent preset in `setup` so tools and prompt sections exist before the agent
 * is published. Skipping that mount leaves `options.tools` empty: the DSH
 * system prompt still tells the model to emit `<dsh_tool_calls>`, and the
 * adapter streams those tags as visible text.
 */
export async function ensureHarnessSessionAttached(input: {
  sessionId: string
  agents: AgentRegistryLike | undefined
  sessions: SessionStoreLike | undefined
  cwd?: string
  agentPresets?: AgentPresetsLike
  agentPreset?: string
}): Promise<void> {
  const { sessionId, agents, sessions, cwd } = input
  const live = agents?.get(sessionId)
  if (live !== undefined) {
    installMirrorCwdVariable(live.ctx?.systemPrompt, cwd, live.session.header?.cwd)
    return
  }
  if (sessions?.get(sessionId) !== undefined && (agents === undefined || typeof agents.resume !== 'function')) {
    return
  }
  if (agents === undefined || typeof agents.resume !== 'function') return
  try {
    const handle = await agents.resume({
      resumeSessionId: sessionId,
      setup: async (agentCtx: AgentSetupContextLike) => {
        installMirrorCwdVariable(
          agentCtx.systemPrompt,
          cwd,
          agentCtx.agent?.session.header?.cwd,
        )
        await input.agentPresets?.mount(agentCtx, input.agentPreset)
      },
    })
    installMirrorCwdVariable(handle.agent.ctx?.systemPrompt, cwd, handle.agent.session.header?.cwd)
  } catch (error) {
    const recovered = agents.get(sessionId)
    if (recovered !== undefined) {
      installMirrorCwdVariable(recovered.ctx?.systemPrompt, cwd, recovered.session.header?.cwd)
      return
    }
    if (sessions?.get(sessionId) !== undefined) return
    const detail = error instanceof Error ? error.message : String(error)
    throw new PluginSessionError(
      `the conversation was saved but could not be opened in Harness: ${detail}`,
      ERROR_CODES.MIRROR_UNAVAILABLE,
    )
  }
}

export function installMirrorCwdVariable(
  systemPrompt: PromptScopeLike | undefined,
  cwd: string | undefined,
  headerCwd?: string,
): void {
  if (systemPrompt === undefined) return
  if (headerCwd !== undefined && headerCwd.length > 0) return
  if (cwd === undefined || cwd.length === 0) return
  try {
    systemPrompt.variable('cwd', () => cwd)
  } catch {
    /* scoped cwd already registered on this agent */
  }
}
