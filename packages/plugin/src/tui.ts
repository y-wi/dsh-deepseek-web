import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { DeepSeekWebService } from './service.ts'

export const name = 'dsh-deepseek-web-tui'
export const inject = ['deepSeekWeb']

export function apply(ctx: Context): void {
  ctx.provide('deepSeekWebTui', {})
  ctx.inject(['commands'], injected => {
    injected.commands.register({
      name: 'deepseek-web',
      description: 'DeepSeek Web login and diagnostics',
      handler: async (invocation: { text?: string }): Promise<CommandResult> => {
        const action = (invocation.text ?? 'status').trim().split(/\s+/)[0]
        const service = ctx.deepSeekWeb as DeepSeekWebService
        if (action === 'login') return { kind: 'success', text: `DeepSeek Web: ${(await service.login({ resetProfile: true })).status}` }
        if (action === 'logout') {
          await service.logout()
          return { kind: 'success', text: 'DeepSeek Web signed out' }
        }
        if (action === 'doctor') {
          const doctor = await service.doctor()
          return { kind: doctor.ok ? 'success' : 'error', text: JSON.stringify(doctor.checks) }
        }
        return { kind: 'success', text: `DeepSeek Web: ${(await service.status()).status}` }
      },
    })
  })
  ctx.inject(['tuiCommandTrees'], injected => {
    const trees = (injected as Context & { tuiCommandTrees: { register(provider: unknown): () => void } }).tuiCommandTrees
    trees.register({
      root: 'deepseek-web',
      descriptions: { en: 'DeepSeek Web', zh: 'DeepSeek Web' },
      children: (path: readonly string[]) => {
        if (path.length === 1) {
          return [
            { name: 'status', description: 'Show sign-in state' },
            { name: 'login', description: 'Sign in with DeepSeek' },
            { name: 'logout', description: 'Sign out' },
            { name: 'doctor', description: 'Run diagnostics' },
          ]
        }
        return []
      },
    })
  })
}
