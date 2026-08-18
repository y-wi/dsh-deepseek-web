import { describe, expect, it } from 'vitest'
import { parseToolProtocol } from '../../packages/plugin/src/tool-bridge/parser.ts'

describe('DSH tool bridge', () => {
  it('parses plugin XML tool calls and does not execute them', () => {
    const parsed = parseToolProtocol(
      '<dsh_tool_calls>{"version":1,"calls":[{"name":"shell","arguments":{"command":"rg"}}]}</dsh_tool_calls>',
      ['shell'],
      { maxBytes: 1024, maxCalls: 3, responseMessageId: 'resp-1' },
    )
    expect(parsed.kind).toBe('calls')
    if (parsed.kind === 'calls') expect(parsed.calls[0]?.name).toBe('shell')
  })
})
