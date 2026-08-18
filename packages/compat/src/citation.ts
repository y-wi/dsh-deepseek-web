import type { DeepSeekCitation } from './types.ts'

export type { DeepSeekCitation } from './types.ts'
export { rewriteCitationMarkers } from './sse.ts'

const MARKER = '[citation:'

function markerPrefixSuffixLen(value: string): number {
  for (let length = MARKER.length - 1; length > 0; length -= 1) {
    if (value.endsWith(MARKER.slice(0, length))) return length
  }
  return 0
}

function citationMarkdown(citation: DeepSeekCitation): string {
  const label = citation.title ?? citation.siteName ?? citation.url
  return `[${label}](${citation.url})`
}

export class CitationStreamGate {
  private pending = ''
  private rendered = ''

  get text(): string {
    return this.rendered
  }

  push(delta: string, citations: readonly DeepSeekCitation[], finish = false): string {
    this.pending += delta
    let visible = ''
    while (true) {
      const start = this.pending.indexOf(MARKER)
      if (start < 0) {
        const held = finish ? 0 : markerPrefixSuffixLen(this.pending)
        const visibleEnd = this.pending.length - held
        visible += this.pending.slice(0, visibleEnd)
        this.pending = this.pending.slice(visibleEnd)
        break
      }
      visible += this.pending.slice(0, start)
      this.pending = this.pending.slice(start)
      const close = this.pending.indexOf(']')
      if (close < 0) {
        if (finish) {
          visible += this.pending
          this.pending = ''
        }
        break
      }
      const marker = this.pending.slice(0, close + 1)
      const index = Number(marker.slice(MARKER.length, -1).trim())
      const citation = citations.find(item => item.citeIndex === index)
      if (citation !== undefined) {
        visible += citationMarkdown(citation)
        this.pending = this.pending.slice(close + 1)
        continue
      }
      if (finish) {
        visible += marker
        this.pending = this.pending.slice(close + 1)
        continue
      }
      break
    }
    this.rendered += visible
    return visible
  }
}
