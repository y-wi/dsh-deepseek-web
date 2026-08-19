import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { DeepSeekWebService } from './service.ts'
import { isCleanMode, setCleanMode } from './clean-turn.ts'

export interface CleanCommandAgent {
  session: { id: string }
  followup?(message: unknown): void
  steer?(message: unknown): void
}

const ON_TEXT = 'Clean mode on. Later turns send only your text, without system prompt, tools, or skills. Send /clean again to turn it off.'
const OFF_TEXT = 'Clean mode off. Later turns use the normal system prompt, tools, and skills.'

export function handleCleanCommand(rawInput: string, agent: CleanCommandAgent): CommandResult {
  const text = rawInput.trim()
  const sessionId = agent.session.id
  if (sessionId.length === 0) {
    return { kind: 'error', text: 'Usage: /clean [message]' }
  }
  if (isCleanMode(sessionId)) {
    setCleanMode(sessionId, false)
    return { kind: 'success', text: OFF_TEXT }
  }
  setCleanMode(sessionId, true)
  if (text.length === 0) {
    return { kind: 'success', text: ON_TEXT }
  }
  const message = createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
  try {
    if (agent.followup !== undefined) agent.followup(message)
    else if (agent.steer !== undefined) agent.steer(message)
    else {
      setCleanMode(sessionId, false)
      return { kind: 'error', text: 'This session cannot send a clean message.' }
    }
  } catch (error) {
    setCleanMode(sessionId, false)
    throw error
  }
  return { kind: 'success', text: ON_TEXT }
}

export function registerCommands(ctx: Context, service: DeepSeekWebService): void {
  ctx.inject(['commands'], injected => {
    injected.commands.register({
      name: 'deepseek-web',
      description: 'DeepSeek Web account commands',
      handler: async (invocation: { text?: string; rawInput?: string }): Promise<CommandResult> => {
        const [action] = (invocation.rawInput ?? invocation.text ?? 'status').trim().split(/\s+/)
        if (action === 'login') {
          const state = await service.login({ resetProfile: true })
          return { kind: 'success', text: `DeepSeek Web: ${state.status}` }
        }
        if (action === 'logout') {
          await service.logout()
          return { kind: 'success', text: 'DeepSeek Web signed out' }
        }
        if (action === 'doctor') {
          const doctor = await service.doctor()
          return { kind: doctor.ok ? 'success' : 'error', text: doctor.checks.map(check => `${check.name}: ${check.detail}`).join('\n') }
        }
        const status = await service.status()
        return { kind: 'success', text: `DeepSeek Web: ${status.status}` }
      },
    })
    injected.commands.register({
      name: 'clean',
      description: 'Toggle sending only your text, without system prompt, tools, or skills',
      input: { hint: 'message' },
      handler: (invocation: { rawInput?: string; agent?: CleanCommandAgent }): CommandResult => {
        const agent = invocation.agent
        if (agent === undefined) {
          return { kind: 'error', text: 'Usage: /clean [message]' }
        }
        return handleCleanCommand(invocation.rawInput ?? '', agent)
      },
    })
  })
}
