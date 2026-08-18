import { canonicalJson, type BridgeToolCall } from './parser.ts'

export interface ToolResultProjection {
  id: string
  name?: string
  isError: boolean
  content: Array<{ type: string; text: string }>
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export function projectToolResult(
  id: string,
  content: unknown,
  isError: boolean,
  maxBytes: number,
): ToolResultProjection {
  const texts: Array<{ type: string; text: string }> = []
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      texts.push({ type: 'text', text: value })
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>
      if (record.type === 'image') {
        texts.push({ type: 'text', text: '[unsupported image tool result: DeepSeek Web inputModalities are text-only]' })
        return
      }
      if (typeof record.text === 'string') {
        texts.push({ type: 'text', text: record.text })
        return
      }
      texts.push({ type: 'text', text: `opaque:${canonicalJson(record).slice(0, 1024)}` })
    }
  }
  walk(content)
  let combined = texts.map(item => item.text).join('\n')
  if (utf8Bytes(combined) > maxBytes) {
    let cut = combined
    while (utf8Bytes(cut) > maxBytes) cut = cut.slice(0, Math.floor(cut.length * 0.9))
    const omitted = utf8Bytes(combined) - utf8Bytes(cut)
    combined = `${cut}\n[omitted ${omitted} bytes]`
  }
  return { id, isError, content: [{ type: 'text', text: combined }] }
}

export function buildExchange(calls: readonly BridgeToolCall[], results: readonly ToolResultProjection[]): string {
  return `<DSH_LOCAL_TOOL_EXCHANGE version="1">
${JSON.stringify({
    calls: calls.map(call => ({ id: call.id, name: call.name, arguments: call.arguments })),
    results,
  })}
</DSH_LOCAL_TOOL_EXCHANGE>
Continue using the Harness tool results.
If another local operation is required, emit a new tool-call block in the answer channel, not in thinking.
Otherwise answer normally.`
}
