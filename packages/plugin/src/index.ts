import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-settings'
import { CompatDeepSeekWebClient, ERROR_CODES } from '@dsh-deepseek-web/compat'
import { DeepSeekWebAdapter } from './adapter.ts'
import { registerAuthRoutes } from './auth-routes.ts'
import { registerSessionRoutes } from './session-routes.ts'
import { RemoteSessionService } from './remote-session-service.ts'
import { ensureDeepSeekChatWorkspace } from './deepseek-chat-workspace.ts'
import type {
  AgentPresetsLike,
  AgentRegistryLike,
  SessionStoreLike,
  WorkspaceRegistryLike,
} from './dsh-session.ts'
import { registerCommands } from './commands.ts'
import {
  DEFAULT_CONFIG,
  PROVIDER,
  SETTINGS_NS,
  resolveConfig,
  type Config as PluginConfig,
  type ResolvedConfig,
} from './config.ts'
import { DeepSeekWebService } from './service.ts'
import { adaptPersistence, type HandlePersistence } from './persistence.ts'

export const name = 'llm-deepseek-web'
export const inject = ['llm']

export type Config = PluginConfig
export const Config: ReturnType<typeof z.object> = z.object({
  tokenEnv: z.string().role('credential-ref').default(DEFAULT_CONFIG.tokenEnv),
  defaultModel: z.union(['default', 'expert']).default('default'),
  thinking: z.union(['enabled', 'disabled']).default('enabled'),
  streamIdleTimeoutMs: z.number(),
  maxToolProtocolBytes: z.number(),
  maxToolCallsPerTurn: z.number(),
  maxProtocolRepairAttempts: z.number(),
  maxToolResultBytes: z.number(),
  browser: z.object({
    preferred: z.union(['auto', 'chrome', 'edge', 'brave', 'chromium', 'managed']),
    allowManagedDownload: z.boolean(),
  }),
})

export { DeepSeekWebAdapter } from './adapter.ts'
export { PROVIDER } from './config.ts'

type CredentialService = {
  resolve(ref: string): Promise<{ value: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

export function apply(ctx: Context, config: Config): void {
  const current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedConfig | undefined
  const options = (): ResolvedConfig => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      lastRaw = raw
      lastGood = resolveConfig(raw)
      return lastGood
    } catch (error) {
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('dsh-deepseek-web: keeping last good configuration after invalid settings')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveCredential = async (): Promise<string> => {
    const ref = credentialRef(options().tokenEnv)
    const credentials = ctx.get('credentials') as CredentialService | undefined
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined && hit.value.length > 0) return hit.value.replace(/^Bearer\s+/i, '')
    }
    throw new LlmError(
      `dsh-deepseek-web: missing credential ${options().tokenEnv}; sign in from Settings or CLI`,
      ERROR_CODES.MISSING_CREDENTIAL,
    )
  }

  const storeCredential = async (token: string): Promise<void> => {
    const credentials = ctx.get('credentials') as CredentialService | undefined
    if (credentials === undefined) throw new Error('credentials service unavailable')
    await credentials.set(credentialRef(options().tokenEnv), token)
  }

  const clearCredential = async (): Promise<void> => {
    const credentials = ctx.get('credentials') as CredentialService | undefined
    if (credentials === undefined) return
    await credentials.unset(credentialRef(options().tokenEnv))
  }

  const client = new CompatDeepSeekWebClient()
  const adapter = new DeepSeekWebAdapter({ options, resolveCredential, client })
  let remoteSessions: RemoteSessionService | undefined
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'DeepSeek Web', settingsNs: ctx.fiber.entry?.options.id ?? SETTINGS_NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([PROVIDER], adapter)

  const service = new DeepSeekWebService({
    resolveHome: () => resolveDshHome(),
    resolveCredential: async () => {
      try {
        return await resolveCredential()
      } catch {
        return undefined
      }
    },
    storeCredential,
    clearCredential,
    validateCredential: async (token, signal) => {
      const account = await client.currentUser(token, signal)
      return { accountHash: account.accountHash }
    },
    config: options,
    onSignOut: () => {
      adapter.clearAccountCache()
      remoteSessions?.clear()
    },
  })
  ctx.provide('deepSeekWeb', service)
  ctx.effect(() => async () => {
    await service.cancel()
    await client.dispose()
  }, 'dsh-deepseek-web: resources')
  const mirrorCwd = (): string => join(resolveDshHome(), 'deepseek-web', 'workspace')
  const persistenceAdapters = new WeakMap<HandlePersistence, NonNullable<ReturnType<typeof adaptPersistence>>>()
  remoteSessions = new RemoteSessionService({
    auth: service,
    client,
    persistence: () => {
      const backend = ctx.get('sessionPersistence') as HandlePersistence | undefined
      if (backend === undefined) return undefined
      let adapted = persistenceAdapters.get(backend)
      if (adapted === undefined) {
        adapted = adaptPersistence(backend)!
        persistenceAdapters.set(backend, adapted)
      }
      return adapted
    },
    workspaces: () => ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined,
    agents: () => ctx.get('agents') as AgentRegistryLike | undefined,
    sessions: () => ctx.get('sessions') as SessionStoreLike | undefined,
    agentPresets: () => ctx.get('agentPresets') as AgentPresetsLike | undefined,
    home: () => resolveDshHome(),
    cwd: mirrorCwd,
    ensureCwd: async path => {
      await mkdir(path, { recursive: true })
    },
  })

  ctx.inject(['workspaceRegistry'], injected => {
    injected.effect(() => {
      void ensureDeepSeekChatWorkspace({
        home: resolveDshHome(),
        workspaces: injected.get('workspaceRegistry') as WorkspaceRegistryLike | undefined,
      }).catch(error => {
        injected.logger.error('dsh-deepseek-web: DeepSeek Chat workspace')
        injected.logger.error(error)
      })
      return () => undefined
    }, 'dsh-deepseek-web: DeepSeek Chat workspace')
  })

  ctx.inject(['webServer'], injected => {
    injected.effect(() => {
      const auth = registerAuthRoutes(injected.webServer, service)
      const sessions = registerSessionRoutes(injected.webServer, remoteSessions!)
      return () => {
        auth()
        sessions()
        remoteSessions?.clear()
      }
    }, 'dsh-deepseek-web: host routes')
  })
  registerCommands(ctx, service)

  ctx.inject(['settings'], injected => {
    injected.effect(() => injected.settings.configure({ auto: false }, ctx.fiber), 'dsh-deepseek-web: settings')
  })
}
