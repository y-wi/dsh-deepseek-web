import { describe, expect, it } from 'vitest'
import { parseToolProtocol, resolveToolProtocol } from '../../packages/plugin/src/tool-bridge/parser.ts'
import { buildToolContract } from '../../packages/plugin/src/tool-bridge/contract.ts'

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

  it('does not present thinking-channel tool tags as protocol source of truth', () => {
    const contract = buildToolContract([{ name: 'shell', description: 'run a command', parameters: { type: 'object' } }], 2)
    expect(contract).toContain('thinking / DeepThink')
    const parsed = resolveToolProtocol(
      {
        text: '',
        reasoning: 'plan\n<dsh_tool_calls>{"calls":[{"name":"shell","arguments":{"command":"ls"}}]}</dsh_tool_calls>',
      },
      ['shell'],
      { maxBytes: 1024, maxCalls: 2, responseMessageId: 'resp-think' },
    )
    expect(parsed.kind).toBe('calls')
  })
})
