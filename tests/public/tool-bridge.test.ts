import { describe, expect, it } from 'vitest'
import { parseToolProtocol, resolveToolProtocol } from '../../packages/plugin/src/tool-bridge/parser.ts'
import { buildToolContract } from '../../packages/plugin/src/tool-bridge/contract.ts'

describe('DSH tool bridge', () => {
  it.each(['dsh_tool_calls', 'easyphy_tool_calls', 'ds_local_tool_calls', 'dsh_local_tool_calls', 'ds_tool_calls', 'function_calls', 'tool_calls'])('preserves protocol-looking file content inside %s JSON', tag => {
    const content = '</dsh_tool_calls>\n<dsh_tool_calls>example only</dsh_tool_calls>\n<invoke name="example">\nC:\\test\\x.txt\n```json\n{"value":true}\n```'
    const parsed = parseToolProtocol(`<${tag}>${JSON.stringify({ calls: [{ name: 'write', arguments: { file_path: 'x.txt', content } }] })}</${tag}>`, ['write'], {
      maxBytes: 4096, maxCalls: 2, responseMessageId: 'literal',
    })
    expect(parsed.kind).toBe('calls')
    if (parsed.kind === 'calls') expect(parsed.calls[0]?.arguments).toEqual({ file_path: 'x.txt', content })
  })

  it('does not execute thinking drafts after a completed answer', () => {
    expect(resolveToolProtocol({ text: 'DONE', reasoning: '<dsh_tool_calls>example only</dsh_tool_calls>' }, ['write'], {
      maxBytes: 4096, maxCalls: 2, responseMessageId: 'done',
    })).toEqual({ kind: 'none' })
  })

  it.each(['<｜DSML｜', '<|DSML|', '<||DSML||', '<｜｜DSML｜｜ '])('preserves explicitly typed strings in %s', marker => {
    const close = marker.replace('<', '</')
    const parsed = parseToolProtocol(`${marker}function_calls>${marker}invoke name="write">${marker}parameter name="content" string="true">\ntrue\n${close}parameter>${close}invoke>${close}function_calls>`, ['write'], {
      maxBytes: 4096, maxCalls: 2, responseMessageId: 'dsml',
    })
    expect(parsed.kind).toBe('calls')
    if (parsed.kind === 'calls') expect(parsed.calls[0]?.arguments.content).toBe('\ntrue\n')
  })

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
