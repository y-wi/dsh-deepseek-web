import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const files = [
  '../../packages/plugin/src/client/index.tsx',
  '../../packages/plugin/src/client/slot-ids.ts',
  '../../packages/plugin/src/session-materializer.ts',
  '../../packages/plugin/src/session-publisher.ts',
  '../../packages/plugin/src/workspace-fork.ts',
  '../../packages/plugin/src/session-routes.ts',
  '../../packages/compat/src/sessions.ts',
  '../../packages/compat/src/history.ts',
]

describe('remote session public surface', () => {
  it('registers sidebar and fork slots without embedding provider wire paths', () => {
    const index = readFileSync(new URL('../../packages/plugin/src/client/index.tsx', import.meta.url), 'utf8')
    const slots = readFileSync(new URL('../../packages/plugin/src/client/slot-ids.ts', import.meta.url), 'utf8')
    expect(slots).toContain('sidebar.footer.action')
    expect(slots).toContain('conversation.chat.assistant-actions')
    expect(slots).toContain('deepseek-web-fork')
    expect(index).toContain('SIDEBAR_ACTION_SLOT')
    expect(index).toContain('FORK_ACTION_SLOT')
    for (const file of files) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toContain('/api/v0/')
    }
  })
})
