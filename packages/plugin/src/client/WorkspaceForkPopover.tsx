import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeepSeekWebSettingsKey } from './locales.ts'

export interface WorkspaceChoice {
  id: string
  title: string
  path: string
}

export function workspaceMenuEntries(
  t: (key: DeepSeekWebSettingsKey) => string,
  workspaces: readonly WorkspaceChoice[],
  options?: { pending?: boolean; error?: string },
): { items: MenuEntry[]; footer?: MenuEntry[] } {
  const items: MenuEntry[] = []
  if (options?.error !== undefined) {
    items.push({ type: 'label', id: 'fork-error', text: options.error })
  }
  if (workspaces.length === 0) {
    items.push({ type: 'label', id: 'fork-empty', text: t('forkEmptyWorkspaces') })
  } else {
    for (const workspace of workspaces) {
      items.push({
        id: workspace.id,
        label: workspace.title || workspace.path,
        disabled: options?.pending === true,
      })
    }
  }
  return {
    items,
    footer: [{ id: '::cancel', label: t('forkCancel'), disabled: options?.pending === true }],
  }
}
