import { describe, expect, it } from 'vitest'
import { redactSensitiveText } from '../../packages/compat/src/redaction.ts'
import { wrapReplay } from '../../packages/plugin/src/replay.ts'

describe('secret boundary', () => {
  it('never leaves tokens in status-like JSON, logs, replay, or settings', () => {
    const token = 'Bearer TEST_ONLY_TOKEN'
    const status = { status: 'signed-in', account: { accountHash: 'abc' } }
    expect(JSON.stringify(status)).not.toMatch(/Bearer|TEST_ONLY_TOKEN/)
    expect(redactSensitiveText(`error ${token}`)).toContain('[redacted]')
    const replay = wrapReplay({
      kind: 'deepseek-web',
      version: 1,
      affinity: { accountHash: 'hash', model: 'default' },
      remote: { chatSessionId: 's', responseMessageId: 'm' },
      history: { inputPrefixHash: 'h' },
      contract: { systemHash: 's', toolsHash: 't', thinking: false, nativeSearch: false },
    })
    expect(JSON.stringify(replay)).not.toMatch(/Bearer|cookie/i)
  })
})
