import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { CompatDeepSeekWebClient, ERROR_CODES } from '@dsh-deepseek-web/compat'
import { DeepSeekWebAdapter } from './adapter.ts'
import { registerAuthRoutes } from './auth-routes.ts'
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

export const name = 'llm-deepseek-web'
export const inject = ['llm']

export type Config = PluginConfig
export const Config = z.object({
  tokenEnv: z.string().role('credential-ref').default(DEFAULT_CONFIG.tokenEnv),
  defaultModel: z.union(['default', 'expert']).default('default'),
  thinking: z.union(['enabled', 'disabled']).default('enabled'),
  nativeSearch: z.union(['off', 'on']).default('off'),
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

const NS = settingsNamespace(SETTINGS_NS)

type CredentialService = {
  resolve(ref: string): Promise<{ value: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
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
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'DeepSeek Web', settingsNs: NS, settingsPath: [] },
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
    onSignOut: () => adapter.clearAccountCache(),
  })
  ctx.provide('deepSeekWeb', service)

  ctx.inject(['webServer'], injected => {
    injected.effect(() => registerAuthRoutes(injected.webServer, service), 'dsh-deepseek-web: auth routes')
  })
  registerCommands(ctx, service)

  installSettingsSection(ctx, NS, Config, config, {
    setSource: source => {
      current = source as () => Config
    },
    onChange: () => options(),
  })
}
