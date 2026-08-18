/** EasyPhy-style session titles: JSON `{ title }` plus a local fallback. Never a chat turn. */

const TITLE_LIMIT = 20
const GENERIC_KEYS = new Set([
  '新对话',
  '对话主题',
  '会话主题',
  '聊天主题',
  '对话标题',
  '会话标题',
  '聊天标题',
  'untitled',
  'conversationtopic',
  'chattopic',
  'conversationtitle',
  'chattitle',
])
const POLITE_PREFIXES = [
  '请帮我',
  '请你帮我',
  '麻烦帮我',
  '麻烦你',
  '能不能帮我',
  '可以帮我',
  '请问',
  '请',
  '现在',
  '我想要',
  '我想',
  '帮我',
  'please ',
  'could you ',
  'can you ',
]
const ACTION_PREFIXES = ['看一下', '看下', '检查一下', '检查下', '如何', '怎么']
const TITLE_REQUEST_MARKER = 'JSON array of human messages:'

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0) ?? ''
}

function stripDecorators(value: string): string {
  let title = value.replace(/^[#*\-•\s]+/, '').trim()
  for (const prefix of ['标题：', '标题:', '主题：', '主题:', 'Title:']) {
    if (title.startsWith(prefix)) {
      title = title.slice(prefix.length).trim()
      break
    }
  }
  return title
    .replace(/^["'“‘]+/, '')
    .replace(/["'”’]+$/, '')
    .replace(/[。.!！?？]+$/, '')
    .trim()
}

function truncate(value: string, limit: number): string {
  const chars = [...value]
  return chars.length <= limit ? value : chars.slice(0, limit).join('')
}

function genericKey(title: string): string {
  return [...title].filter(character => /\p{Letter}|\p{Number}/u.test(character)).join('').toLowerCase()
}

function isGeneric(title: string): boolean {
  return GENERIC_KEYS.has(genericKey(title))
}

/**
 * Parse a structured title payload (`{"title":"..."}` / `{"标题":"..."}`) or
 * the first usable line of free text. Mirrors EasyPhy `normalize_title`.
 */
export function parseStructuredTitle(value: string): string {
  const trimmed = value.trim()
  let raw = trimmed
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === 'string') raw = parsed
    else if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const nested = record.title ?? record['标题'] ?? record.content
      if (typeof nested === 'string' && nested.trim().length > 0) raw = nested
    }
  } catch {
    /* plain text */
  }
  const title = stripDecorators(compact(firstLine(raw)))
  if (title.length === 0 || isGeneric(title)) return '新对话'
  return truncate(title, TITLE_LIMIT)
}

function userText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => (block as { type?: string }).type === 'text')
    .map(block => String((block as { text?: string }).text ?? ''))
    .join('\n')
}

function messageText(item: unknown): string {
  if (typeof item === 'string') return item
  if (typeof item !== 'object' || item === null) return ''
  const record = item as Record<string, unknown>
  const value = record.text ?? record.content ?? record.title
  return typeof value === 'string' ? value : ''
}

/** Unwrap DSH session-title-llm's JSON-framed user prompt into source texts. */
function unframeTitleRequest(text: string): string[] {
  const index = text.indexOf(TITLE_REQUEST_MARKER)
  const payload = (index >= 0 ? text.slice(index + TITLE_REQUEST_MARKER.length) : text).trim()
  try {
    const parsed = JSON.parse(payload) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(messageText).map(compact).filter(item => item.length > 0)
  } catch {
    return []
  }
}

function sourceTexts(messages: readonly unknown[]): string[] {
  const texts: string[] = []
  for (const message of messages) {
    const record = message as { role?: string; content?: unknown }
    if (record.role !== undefined && record.role !== 'user') continue
    const raw = compact(userText(record.content ?? record))
    if (raw.length === 0) continue
    const framed = unframeTitleRequest(raw)
    if (framed.length > 0) texts.push(...framed)
    else texts.push(raw)
  }
  return texts
}

function fallbackTitleFromText(source: string): string {
  let text = compact(source)
  for (;;) {
    const lower = text.toLowerCase()
    const prefix = POLITE_PREFIXES.find(item => lower.startsWith(item.toLowerCase()))
      ?? ACTION_PREFIXES.find(item => text.startsWith(item))
    if (prefix === undefined) break
    text = text.slice(prefix.length).trim()
  }
  const segment = text
    .split(/[。！？!?；;\n\r]/)
    .map(part => part.trim())
    .find(part => part.length > 0) ?? text
  const candidate = parseStructuredTitle(segment)
  return candidate === '新对话' ? '新对话' : truncate(candidate, 18)
}

function looksStructured(value: string): boolean {
  try {
    const parsed = JSON.parse(value.trim()) as unknown
    if (typeof parsed === 'string') return true
    if (typeof parsed !== 'object' || parsed === null) return false
    const record = parsed as Record<string, unknown>
    return typeof record.title === 'string' || typeof record['标题'] === 'string'
  } catch {
    return false
  }
}

/** Local fallback from the first user prompt when Web providers skip a remote title turn. */
export function fallbackSessionTitle(messages: readonly unknown[]): string {
  for (const text of sourceTexts(messages)) {
    if (looksStructured(text)) {
      const structured = parseStructuredTitle(text)
      if (structured !== '新对话') return structured
    }
    const title = fallbackTitleFromText(text)
    if (title !== '新对话') return title
  }
  return '新对话'
}

/** Prefer the official Web `event: title`, else a local EasyPhy-style fallback. */
export function resolveSessionTitle(liveTitle: string | undefined, messages: readonly unknown[]): string {
  if (liveTitle !== undefined && liveTitle.trim().length > 0) {
    const title = parseStructuredTitle(liveTitle)
    if (title !== '新对话') return title
  }
  return fallbackSessionTitle(messages)
}
