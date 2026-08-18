export function messageHasImage(messages: readonly unknown[]): boolean {
  for (const message of messages) {
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    if (content.some(block => (block as { type?: string }).type === 'image')) return true
  }
  return false
}

export function flattenText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => (block as { type?: string }).type === 'text' || (block as { type?: string }).type === 'reasoning')
    .map(block => String((block as { text?: string }).text ?? ''))
    .join('\n')
}

export interface ImageBlockRef {
  attachmentId: string
  mediaType?: string
  name?: string
  bytes?: number
}

export function collectImageRefs(messages: readonly unknown[]): ImageBlockRef[] {
  const out: ImageBlockRef[] = []
  const seen = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    if (record.type === 'image' && record.attachment && typeof record.attachment === 'object') {
      const attachment = record.attachment as ImageBlockRef
      const id = String(attachment.attachmentId ?? '')
      if (id.length > 0 && !seen.has(id)) {
        seen.add(id)
        out.push(attachment)
      }
      return
    }
    if ('content' in record) walk(record.content)
  }
  for (const message of messages) walk(message)
  return out
}

export function toolCallBlocks(content: unknown): Array<{ id: string; name: string; arguments: string }> {
  if (!Array.isArray(content)) return []
  return content
    .filter(block => (block as { type?: string }).type === 'tool-call')
    .map(block => block as { id: string; name: string; arguments: string })
}

export function toolResultFromMessage(message: unknown): { id: string; content: unknown; isError: boolean } | undefined {
  const record = message as {
    source?: { kind?: string; callId?: string }
    content?: unknown
  }
  if (record.source?.kind !== 'tool') return undefined
  const block = Array.isArray(record.content) ? record.content[0] : record.content
  const typed = block as { type?: string; id?: string; content?: unknown; isError?: boolean; toolCallId?: string }
  return {
    id: String(typed?.id ?? typed?.toolCallId ?? record.source.callId ?? ''),
    content: typed?.content ?? record.content,
    isError: Boolean(typed?.isError),
  }
}
