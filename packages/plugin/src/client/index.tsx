import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { DeepSeekWebSettings } from './DeepSeekWebSettings.tsx'
import type { DeepSeekWebSettingsInjected } from './DeepSeekWebSettings.tsx'
import { en, zh } from './locales.ts'
import type { DeepSeekWebSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.deepseek-web': DeepSeekWebSettingsKey
  }
}

export const name = 'dsh-deepseek-web-client'
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const namespace = 'settings.deepseek-web'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-deepseek-web: settings copy')
  const t = ctx.locale.bind(namespace) as DeepSeekWebSettingsInjected['t']
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'deepseek-web',
    order: 16,
    label: () => t('nav'),
    inject: (): DeepSeekWebSettingsInjected => ({ t }),
  }, DeepSeekWebSettings))
}
