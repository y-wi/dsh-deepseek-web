import { createHash } from 'node:crypto'

export interface BridgeToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface BridgeToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ParsedToolProtocol =
  | { kind: 'none' }
  | { kind: 'calls'; calls: BridgeToolCall[] }
  | { kind: 'invalid'; reason: string }

export const DSH_OPEN = '<dsh_tool_calls>'
export const DSH_CLOSE = '</dsh_tool_calls>'
export const EASYPHY_OPEN = '<easyphy_tool_calls>'
export const EASYPHY_CLOSE = '</easyphy_tool_calls>'
const DSML_OPEN = '<||DSML||'
const DSML_FULLWIDTH_OPEN = '<｜DSML｜'
const XML_INVOKE_OPEN = '<invoke name='
const MARKED_BLOCKS = [
  ['<dsh_tool_calls>', '</dsh_tool_calls>'],
  ['<easyphy_tool_calls>', '</easyphy_tool_calls>'],
  ['<ds_local_tool_calls>', '</ds_local_tool_calls>'],
  ['<dsh_local_tool_calls>', '</dsh_local_tool_calls>'],
  ['<ds_tool_calls>', '</ds_tool_calls>'],
  ['<function_calls>', '</function_calls>'],
  ['<tool_calls>', '</tool_calls>'],
] as const
const TEXT_PROTOCOL_OPEN_MARKERS = [
  ...MARKED_BLOCKS.map(([open]) => open),
  DSML_OPEN,
  DSML_FULLWIDTH_OPEN,
  XML_INVOKE_OPEN,
] as const

export function shouldBufferAsToolProtocol(text: string, hasTools: boolean): boolean {
  if (!hasTools) return false
  return visibleTextBeforeToolProtocol(text, true).length === 0
}

export function visibleTextBeforeToolProtocol(text: string, hasTools: boolean): string {
  if (!hasTools) return text
  let cut = text.length
  for (const marker of TEXT_PROTOCOL_OPEN_MARKERS) {
    const at = text.indexOf(marker)
    if (at >= 0) cut = Math.min(cut, at)
  }
  const before = text.slice(0, cut)
  const hold = trailingToolMarkerPrefixLen(before)
  return before.slice(0, before.length - hold)
}

function trailingToolMarkerPrefixLen(text: string): number {
  let held = 0
  for (const marker of TEXT_PROTOCOL_OPEN_MARKERS) {
    for (let length = Math.min(marker.length - 1, text.length); length > 0; length -= 1) {
      if (text.endsWith(marker.slice(0, length))) {
        held = Math.max(held, length)
        break
      }
    }
  }
  return held
}

export function toBridgeTools(tools: readonly { name: string; description: string; parameters: Record<string, unknown> }[]): BridgeToolSchema[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}

export function toolCallId(responseMessageId: string, index: number, name: string, args: Record<string, unknown>): string {
  const framed = [
    String(responseMessageId.length), responseMessageId,
    String(String(index).length), String(index),
    String(name.length), name,
    String(canonicalJson(args).length), canonicalJson(args),
  ].join('\0')
  const hex = createHash('sha256').update(framed).digest('hex').slice(0, 32)
  return `deepseek-web-${hex}`
}

function insideFence(content: string, index: number): boolean {
  const count = content.slice(0, index).split('```').length - 1
  return count % 2 === 1
}

export function repairTruncatedJson(body: string): string | undefined {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of body) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return undefined
    }
  }
  if (inString || escaped || stack.length === 0 || stack.length > 8) return undefined
  const repaired = body + stack.reverse().join('')
  try {
    JSON.parse(repaired)
    return repaired
  } catch {
    return undefined
  }
}

function parseMarkedBlock(
  content: string,
  open: string,
  close: string,
  allowed: Set<string>,
  maxBytes: number,
  maxCalls: number,
  responseMessageId: string,
): ParsedToolProtocol | undefined {
  const start = content.indexOf(open)
  if (start < 0) {
    if (content.includes(close)) return { kind: 'invalid', reason: 'tool protocol missing open marker' }
    return undefined
  }
  if (insideFence(content, start)) return { kind: 'invalid', reason: 'tool protocol must not be fenced' }
  if (content.slice(start + open.length).includes(open)) return { kind: 'invalid', reason: 'multiple open markers' }
  const bodyStart = start + open.length
  const relativeEnd = content.slice(bodyStart).indexOf(close)
  if (relativeEnd < 0) return { kind: 'invalid', reason: 'tool protocol missing close marker' }
  const bodyEnd = bodyStart + relativeEnd
  if (bodyEnd - bodyStart > maxBytes) return { kind: 'invalid', reason: 'tool protocol exceeds size limit' }
  if (content.slice(bodyEnd + close.length).trim().length > 0) {
    return { kind: 'invalid', reason: 'text after tool protocol' }
  }
  const raw = content.slice(bodyStart, bodyEnd).trim()
  try {
    return callsFromJson(JSON.parse(raw) as unknown, allowed, maxCalls, responseMessageId)
  } catch (error) {
    const repaired = repairTruncatedJson(raw)
    if (repaired !== undefined) {
      try {
        return callsFromJson(JSON.parse(repaired) as unknown, allowed, maxCalls, responseMessageId)
      } catch {
        /* XML invoke bodies can contain CSS braces; fall through. */
      }
    }
    const xml = parseInvokes(raw, allowed, maxCalls, responseMessageId)
    if (xml !== undefined) return xml
    return { kind: 'invalid', reason: `invalid tool protocol JSON: ${String(error)}` }
  }
}

function callsFromJson(
  parsed: unknown,
  allowed: Set<string>,
  maxCalls: number,
  responseMessageId: string,
): ParsedToolProtocol {
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'invalid', reason: 'tool protocol is not an object' }
  const version = (parsed as { version?: unknown }).version
  if (version !== undefined && version !== 1) return { kind: 'invalid', reason: 'unsupported tool protocol version' }
  const rawCalls = (parsed as { calls?: unknown }).calls
  if (!Array.isArray(rawCalls)) return { kind: 'invalid', reason: 'tool protocol missing calls array' }
  if (rawCalls.length < 1 || rawCalls.length > maxCalls) {
    return { kind: 'invalid', reason: `tool protocol calls must be 1..${maxCalls}` }
  }
  const calls: BridgeToolCall[] = []
  for (const [index, raw] of rawCalls.entries()) {
    if (typeof raw !== 'object' || raw === null) return { kind: 'invalid', reason: `call ${index + 1} is not an object` }
    const name = String((raw as { name?: unknown }).name ?? '').trim()
    if (name.length === 0) return { kind: 'invalid', reason: `call ${index + 1} has empty name` }
    if (!allowed.has(name)) return { kind: 'invalid', reason: `tool ${name} is not allowed` }
    let args = (raw as { arguments?: unknown }).arguments
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args)
      } catch {
        return { kind: 'invalid', reason: `call ${index + 1} arguments are not a JSON object` }
      }
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return { kind: 'invalid', reason: `call ${index + 1} arguments must be an object` }
    }
    const objectArgs = args as Record<string, unknown>
    calls.push({
      id: toolCallId(responseMessageId, index, name, objectArgs),
      name,
      arguments: objectArgs,
    })
  }
  return { kind: 'calls', calls }
}

function stripDsml(content: string): string {
  return content
    .replaceAll('<||DSML||', '<')
    .replaceAll('</||DSML||', '</')
    .replaceAll('<｜DSML｜', '<')
    .replaceAll('</｜DSML｜', '</')
}

function parseParamValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return ''
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return raw.startsWith('\n') || raw.endsWith('\n') ? trimmed : raw
  }
}

export function parseInvokes(
  content: string,
  allowed: Set<string>,
  maxCalls: number,
  responseMessageId: string,
): ParsedToolProtocol | undefined {
  const normalized = stripDsml(content)
  if (!/<invoke\s+name=/i.test(normalized)) return undefined
  const calls: BridgeToolCall[] = []
  let rest = normalized
  while (true) {
    const match = rest.match(/<invoke\s+name=["']([^"']+)["'][^>]*>/i)
    if (match === null || match.index === undefined) break
    rest = rest.slice(match.index + match[0].length)
    const closeMatch = rest.match(/<\/invoke>/i)
    if (closeMatch === null || closeMatch.index === undefined) {
      return { kind: 'invalid', reason: 'tool invoke missing close tag' }
    }
    const body = rest.slice(0, closeMatch.index)
    rest = rest.slice(closeMatch.index + closeMatch[0].length)
    const name = match[1]!.trim()
    if (name.length === 0) return { kind: 'invalid', reason: `call ${calls.length + 1} has empty name` }
    if (!allowed.has(name)) return { kind: 'invalid', reason: `tool ${name} is not allowed` }
    const args: Record<string, unknown> = {}
    let paramRest = body
    while (true) {
      const param = paramRest.match(/<parameter\s+name=["']([^"']+)["'][^>]*>/i)
      if (param === null || param.index === undefined) break
      paramRest = paramRest.slice(param.index + param[0].length)
      const pCloseMatch = paramRest.match(/<\/parameter>/i)
      if (pCloseMatch === null || pCloseMatch.index === undefined) {
        return { kind: 'invalid', reason: `tool ${name} parameter ${param[1]} missing close tag` }
      }
      args[param[1]!] = parseParamValue(paramRest.slice(0, pCloseMatch.index))
      paramRest = paramRest.slice(pCloseMatch.index + pCloseMatch[0].length)
    }
    calls.push({
      id: toolCallId(responseMessageId, calls.length, name, args),
      name,
      arguments: args,
    })
  }
  if (calls.length === 0) return { kind: 'invalid', reason: 'invoke marker without a complete call' }
  if (calls.length > maxCalls) return { kind: 'invalid', reason: 'too many tool calls' }
  return { kind: 'calls', calls }
}

export function parseDsml(
  content: string,
  allowed: Set<string>,
  maxCalls: number,
  responseMessageId: string,
): ParsedToolProtocol | undefined {
  const normalized = content.replaceAll('｜', '|')
  if (!normalized.includes('<||DSML||tool_calls>') && !normalized.includes('<||DSML||invoke')) return undefined
  return parseInvokes(normalized, allowed, maxCalls, responseMessageId)
    ?? { kind: 'invalid', reason: 'DSML marker without invokes' }
}

export function parseToolProtocol(
  content: string,
  allowedTools: readonly string[],
  options: { maxBytes: number; maxCalls: number; responseMessageId: string },
): ParsedToolProtocol {
  const allowed = new Set(allowedTools)
  for (const [open, close] of MARKED_BLOCKS) {
    const parsed = parseMarkedBlock(content, open, close, allowed, options.maxBytes, options.maxCalls, options.responseMessageId)
    if (parsed) return parsed
  }
  const dsml = parseDsml(content, allowed, options.maxCalls, options.responseMessageId)
  if (dsml) return dsml
  const stripped = stripDsml(content).trimStart()
  if (/^<invoke\s+name=/i.test(stripped)) {
    const xml = parseInvokes(content, allowed, options.maxCalls, options.responseMessageId)
    if (xml) return xml
  }
  return { kind: 'none' }
}
