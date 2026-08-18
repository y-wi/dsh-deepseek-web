import { MAX_SSE_EVENT_BYTES, MAX_SSE_TOTAL_BYTES } from './constants.ts'
import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { getProtocolCoreSync, loadProtocolCore, type ProtocolStreamAssembler } from './protocol/core.ts'
import type { DeepSeekCitation, DeepSeekStreamDelta, DeepSeekTurn } from './types.ts'

export class SseParser {
  private buffer = ''
  private total = 0

  push(chunk: string, onEvent: (event: string, data: string) => void): void {
    this.total += chunk.length
    if (this.total > MAX_SSE_TOTAL_BYTES) {
      throw new DeepSeekWebError('SSE stream exceeds size limit', ERROR_CODES.PROTOCOL)
    }
    this.buffer += chunk
    while (true) {
      const split = this.buffer.indexOf('\n\n')
      if (split < 0) break
      const raw = this.buffer.slice(0, split)
      this.buffer = this.buffer.slice(split + 2)
      if (raw.length > MAX_SSE_EVENT_BYTES) {
        throw new DeepSeekWebError('SSE event exceeds size limit', ERROR_CODES.PROTOCOL)
      }
      let event = ''
      const dataLines: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      onEvent(event, dataLines.join('\n'))
    }
  }
}

export class DeepSeekWebSseAssembler {
  private readonly inner: ProtocolStreamAssembler

  constructor(inner?: ProtocolStreamAssembler) {
    this.inner = inner ?? getProtocolCoreSync().createStream()
  }

  takeDelta(): DeepSeekStreamDelta {
    return this.inner.takeDelta()
  }

  processEvent(event: string, data: string): void {
    this.inner.processEvent(event, data)
  }

  finish(): DeepSeekTurn {
    return this.inner.finish()
  }
}

export function rewriteCitationMarkers(text: string, citations: DeepSeekCitation[]): string {
  return text.replace(/\[citation:(\d+)\]/g, (match, index: string) => {
    const citation = citations.find(item => item.citeIndex === Number(index))
    if (citation === undefined) return match
    const label = citation.title ?? citation.siteName ?? citation.url
    return `[${label}](${citation.url})`
  })
}

export async function readSseResponse(
  response: Response,
  signal?: AbortSignal,
  idleTimeoutMs = 180_000,
  onDelta?: (delta: DeepSeekStreamDelta) => void,
): Promise<DeepSeekTurn> {
  const parser = new SseParser()
  const core = await loadProtocolCore()
  const assembler = new DeepSeekWebSseAssembler(core.createStream())
  if (response.body === null) {
    throw new DeepSeekWebError('empty SSE body', ERROR_CODES.PROTOCOL_INCOMPLETE)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let citationCount = 0
  const handleEvent = (event: string, data: string): void => {
    assembler.processEvent(event, data)
    if (onDelta === undefined) return
    const delta = assembler.takeDelta()
    const citationsChanged = delta.citations.length !== citationCount
    citationCount = delta.citations.length
    if (delta.reasoning.length > 0 || delta.text.length > 0 || citationsChanged) onDelta(delta)
  }
  let idle = setTimeout(() => {
    void reader.cancel()
  }, idleTimeoutMs)
  try {
    while (true) {
      if (signal?.aborted) throw new DeepSeekWebError('SSE aborted', ERROR_CODES.TIMEOUT)
      const { done, value } = await reader.read()
      clearTimeout(idle)
      if (done) break
      idle = setTimeout(() => {
        void reader.cancel()
      }, idleTimeoutMs)
      parser.push(decoder.decode(value, { stream: true }), handleEvent)
    }
    parser.push(decoder.decode(), handleEvent)
    return assembler.finish()
  } finally {
    clearTimeout(idle)
  }
}
