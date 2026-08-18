import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { DeepSeekWebService } from './service.ts'

export function registerCommands(ctx: Context, service: DeepSeekWebService): void {
  ctx.inject(['commands'], injected => {
    injected.commands.register({
      name: 'deepseek-web',
      description: 'DeepSeek Web account commands',
      handler: async (invocation: { text?: string }): Promise<CommandResult> => {
        const [action] = (invocation.text ?? 'status').trim().split(/\s+/)
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
  })
}
