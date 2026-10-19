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
const DSML_DOUBLE_FULLWIDTH_OPEN = '<｜｜DSML｜｜'
const DSML_SINGLE_OPEN = '<|DSML|'
const XML_INVOKE_OPEN = '<invoke'
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
  DSML_DOUBLE_FULLWIDTH_OPEN,
  DSML_SINGLE_OPEN,
  XML_INVOKE_OPEN,
] as const

/** Protocol delimiters inside a JSON string are file/command data. */
function markedBodyEnd(content: string, start: number, close: string): number {
  if (!/^[\s]*[\[{]/.test(content.slice(start))) return content.indexOf(close, start)
  let quoted = false
  let escaped = false
  for (let index = start; index < content.length; index++) {
    const char = content[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else {
      if (content.startsWith(close, index)) return index
      if (char === '"') quoted = true
    }
  }
  return -1
}

export function shouldBufferAsToolProtocol(text: string, hasTools: boolean): boolean {
  if (!hasTools) return false
  return visibleTextBeforeToolProtocol(text, true).length === 0
}

/** First complete marked tool block, ignoring surrounding natural language. */
export function extractMarkedToolSlice(content: string): string | undefined {
  let best: { start: number; slice: string } | undefined
  for (const [open, close] of MARKED_BLOCKS) {
    const start = content.indexOf(open)
    if (start < 0) continue
    if (insideFence(content, start)) continue
    const bodyStart = start + open.length
    const end = markedBodyEnd(content, bodyStart, close)
    if (end < 0) continue
    const slice = content.slice(start, end + close.length)
    if (best === undefined || start < best.start) best = { start, slice }
  }
  return best?.slice
}

/**
 * Answer channel first, then thinking. A well-formed block in DeepThink is
 * recovered for execution but never shown as reasoning text.
 */
export function resolveToolProtocol(
  channels: { text: string; reasoning?: string },
  allowedTools: readonly string[],
  options: { maxBytes: number; maxCalls: number; responseMessageId: string },
): ParsedToolProtocol {
  const tryParse = (content: string | undefined): ParsedToolProtocol => {
    if (content === undefined || content.trim().length === 0) return { kind: 'none' }
    const strict = parseToolProtocol(content, allowedTools, options)
    if (strict.kind === 'calls') return strict
    // Recover a preamble/trailer or consecutive complete blocks as one batch.
    // Validate every block before returning any calls; never execute a valid prefix.
    let rest = content
    const calls: BridgeToolCall[] = []
    let bytes = 0
    while (true) {
      const slice = extractMarkedToolSlice(rest)
      if (slice === undefined) break
      const prefix = rest.slice(0, rest.indexOf(slice))
      if (TEXT_PROTOCOL_OPEN_MARKERS.some(marker => prefix.includes(marker))) return strict
      const extracted = parseToolProtocol(slice, allowedTools, options)
      if (extracted.kind !== 'calls') return extracted
      bytes += Buffer.byteLength(slice, 'utf8')
      calls.push(...extracted.calls)
      if (bytes > options.maxBytes || calls.length > options.maxCalls) {
        return { kind: 'invalid', reason: 'tool protocol batch exceeds limits' }
      }
      rest = rest.slice(rest.indexOf(slice) + slice.length)
    }
    if (calls.length > 0 && !TEXT_PROTOCOL_OPEN_MARKERS.some(marker => rest.includes(marker))) {
      return { kind: 'calls', calls: calls.map((call, index) => ({
        ...call, id: toolCallId(options.responseMessageId, index, call.name, call.arguments),
      })) }
    }
    return strict
  }
  const fromText = tryParse(channels.text)
  if (fromText.kind !== 'none') return fromText
  // Thinking may quote source files, protocol examples, or abandoned drafts.
  // A completed answer takes precedence over those incidental markers.
  if (channels.text.trim().length > 0) return fromText
  const fromReasoning = tryParse(channels.reasoning)
  if (fromReasoning.kind === 'calls') return fromReasoning
  return fromReasoning
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
  const bodyStart = start + open.length
  const bodyEnd = markedBodyEnd(content, bodyStart, close)
  if (bodyEnd < 0) return { kind: 'invalid', reason: 'tool protocol missing close marker' }
  if (Buffer.byteLength(content.slice(bodyStart, bodyEnd), 'utf8') > maxBytes) return { kind: 'invalid', reason: 'tool protocol exceeds size limit' }
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
    if (/^[\[{]/.test(raw)) {
      return { kind: 'invalid', reason: `invalid tool protocol JSON: ${String(error)}` }
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
  return content.replace(/<(\/?)[|｜]{1,2}DSML[|｜]{1,2}[\t ]*/g, '<$1')
}

function attribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]
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
  if (!/<invoke\b/i.test(normalized)) return undefined
  const calls: BridgeToolCall[] = []
  let rest = normalized
  while (true) {
    const match = rest.match(/<invoke\b([^>]*)>/i)
    if (match === null || match.index === undefined) break
    rest = rest.slice(match.index + match[0].length)
    const closeMatch = rest.match(/<\/invoke>/i)
    if (closeMatch === null || closeMatch.index === undefined) {
      return { kind: 'invalid', reason: 'tool invoke missing close tag' }
    }
    const body = rest.slice(0, closeMatch.index)
    rest = rest.slice(closeMatch.index + closeMatch[0].length)
    const name = attribute(match[1]!, 'name')?.trim() ?? ''
    if (name.length === 0) return { kind: 'invalid', reason: `call ${calls.length + 1} has empty name` }
    if (!allowed.has(name)) return { kind: 'invalid', reason: `tool ${name} is not allowed` }
    const args: Record<string, unknown> = {}
    let paramRest = body
    while (true) {
      const param = paramRest.match(/<parameter\b([^>]*)>/i)
      if (param === null || param.index === undefined) break
      if (paramRest.slice(0, param.index).trim().length > 0) return { kind: 'invalid', reason: `tool ${name} has malformed parameters` }
      const paramName = attribute(param[1]!, 'name')
      if (!paramName || Object.hasOwn(args, paramName)) return { kind: 'invalid', reason: `tool ${name} has missing or duplicate parameter names` }
      paramRest = paramRest.slice(param.index + param[0].length)
      const pCloseMatch = paramRest.match(/<\/parameter>/i)
      if (pCloseMatch === null || pCloseMatch.index === undefined) {
        return { kind: 'invalid', reason: `tool ${name} parameter ${paramName} missing close tag` }
      }
      const raw = paramRest.slice(0, pCloseMatch.index)
      const value = attribute(param[1]!, 'string')?.toLowerCase() === 'true' ? raw : parseParamValue(raw)
      Object.defineProperty(args, paramName, { value, enumerable: true, configurable: true, writable: true })
      paramRest = paramRest.slice(pCloseMatch.index + pCloseMatch[0].length)
    }
    if (paramRest.trim().length > 0) return { kind: 'invalid', reason: `tool ${name} has malformed parameters` }
    calls.push({
      id: toolCallId(responseMessageId, calls.length, name, args),
      name,
      arguments: args,
    })
  }
  if (calls.length === 0) return { kind: 'invalid', reason: 'invoke marker without a complete call' }
  if (/<(?:invoke|parameter)\b/i.test(rest)) return { kind: 'invalid', reason: 'tool invoke has an incomplete trailing call' }
  if (calls.length > maxCalls) return { kind: 'invalid', reason: 'too many tool calls' }
  return { kind: 'calls', calls }
}

export function parseDsml(
  content: string,
  allowed: Set<string>,
  maxCalls: number,
  responseMessageId: string,
): ParsedToolProtocol | undefined {
  const marker = content.search(/<[|｜]{1,2}DSML[|｜]{1,2}/)
  if (marker < 0) return undefined
  if (insideFence(content, marker)) return { kind: 'invalid', reason: 'tool protocol must not be fenced' }
  return parseInvokes(content, allowed, maxCalls, responseMessageId)
    ?? { kind: 'invalid', reason: 'DSML marker without invokes' }
}

export function parseToolProtocol(
  content: string,
  allowedTools: readonly string[],
  options: { maxBytes: number; maxCalls: number; responseMessageId: string },
): ParsedToolProtocol {
  const allowed = new Set(allowedTools)
  // The outermost protocol owns its payload. An alias mentioned inside a
  // string argument must never override that enclosing call.
  const marked = MARKED_BLOCKS.filter(([open]) => content.includes(open))
    .sort(([a], [b]) => content.indexOf(a) - content.indexOf(b))
  const markedAt = marked.length ? content.indexOf(marked[0]![0]) : Infinity
  const dsmlAt = content.search(/<[|｜]{1,2}DSML[|｜]{1,2}/)
  const invokeAt = content.search(/<invoke\b/i)
  if (dsmlAt >= 0 && dsmlAt < markedAt && (invokeAt < 0 || dsmlAt < invokeAt)) {
    if (Buffer.byteLength(content, 'utf8') > options.maxBytes) return { kind: 'invalid', reason: 'tool protocol exceeds size limit' }
    return parseDsml(content, allowed, options.maxCalls, options.responseMessageId)!
  }
  if (invokeAt >= 0 && invokeAt < markedAt) {
    if (insideFence(content, invokeAt)) return { kind: 'invalid', reason: 'tool protocol must not be fenced' }
    if (Buffer.byteLength(content, 'utf8') > options.maxBytes) return { kind: 'invalid', reason: 'tool protocol exceeds size limit' }
    return parseInvokes(content, allowed, options.maxCalls, options.responseMessageId)!
  }
  for (const [open, close] of marked.length ? marked : MARKED_BLOCKS) {
    const parsed = parseMarkedBlock(content, open, close, allowed, options.maxBytes, options.maxCalls, options.responseMessageId)
    if (parsed) return parsed
  }
  return { kind: 'none' }
}
