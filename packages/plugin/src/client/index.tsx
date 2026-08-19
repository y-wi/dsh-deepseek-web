import type { ClientContext, HarnessWorkspacesLike } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DeepSeekWebSettings } from './DeepSeekWebSettings.tsx'
import type { DeepSeekWebSettingsInjected } from './DeepSeekWebSettings.tsx'
import { DeepSeekSidebarAction } from './DeepSeekSidebarAction.tsx'
import { ForkToWorkspaceAction } from './ForkToWorkspaceAction.tsx'
import { en, zh } from './locales.ts'
import type { DeepSeekWebSettingsKey } from './locales.ts'
import {
  FORK_ACTION_ID,
  FORK_ACTION_ORDER,
  FORK_ACTION_SLOT,
  SIDEBAR_ACTION_ID,
  SIDEBAR_ACTION_ORDER,
  SIDEBAR_ACTION_SLOT,
} from './slot-ids.ts'
import { openHarnessSession } from './wait-for-session.ts'
import type { WorkspaceChoice } from './WorkspaceForkPopover.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.deepseek-web': DeepSeekWebSettingsKey
  }
}

export const name = 'dsh-deepseek-web-client'
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

function workspaceChoices(workspaces: HarnessWorkspacesLike | undefined): WorkspaceChoice[] {
  const items = workspaces?.list?.getSnapshot()?.items ?? []
  const choices = items.flatMap(item => {
    const id = item.workspaceId ?? item.id
    if (id === undefined || typeof item.path !== 'string') return []
    return [{ id, title: item.title ?? item.path, path: item.path }]
  })
  return choices.sort((left, right) => {
    if (left.title === 'DeepSeek Chat') return -1
    if (right.title === 'DeepSeek Chat') return 1
    return 0
  })
}

export function apply(ctx: ClientContext): void {
  const namespace = 'settings.deepseek-web'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-deepseek-web: settings copy')
  const t = ctx.locale.bind(namespace) as DeepSeekWebSettingsInjected['t']
  const openSession = (sessionId: string) => openHarnessSession(ctx.sessions, sessionId)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'deepseek-web',
    order: 16,
    label: () => t('nav'),
    inject: (): DeepSeekWebSettingsInjected => ({ t }),
  }, DeepSeekWebSettings))

  ctx.slots.inject(SIDEBAR_ACTION_SLOT, () => ctx.slots.register({
    name: SIDEBAR_ACTION_SLOT,
    id: SIDEBAR_ACTION_ID,
    order: SIDEBAR_ACTION_ORDER,
    locale: namespace,
    inject: () => ({
      t,
      openSession,
    }),
  }, DeepSeekSidebarAction))

  ctx.slots.inject(FORK_ACTION_SLOT, () => ctx.slots.register({
    name: FORK_ACTION_SLOT,
    id: FORK_ACTION_ID,
    order: FORK_ACTION_ORDER,
    locale: namespace,
    inject: (sessionId: string) => ({
      t,
      sourceSessionId: sessionId,
      openSession,
      loadWorkspaces: async () => {
        await ctx.workspaces?.refresh?.()
        return workspaceChoices(ctx.workspaces)
      },
    }),
  }, ForkToWorkspaceAction))
}
