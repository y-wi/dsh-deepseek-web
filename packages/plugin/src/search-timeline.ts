import type { DeepSeekCitation } from '@dsh-deepseek-web/compat'

export interface SearchTimelineSource {
  url: string
  title: string
}

export function searchTimelineSources(citations: readonly DeepSeekCitation[]): SearchTimelineSource[] {
  const seen = new Set<string>()
  const sources: SearchTimelineSource[] = []
  for (const citation of citations) {
    if (citation.url.length === 0 || seen.has(citation.url)) continue
    seen.add(citation.url)
    sources.push({
      url: citation.url,
      title: citation.title ?? citation.siteName ?? citation.url,
    })
  }
  return sources
}

/** Markdown source list mapped from chat.deepseek.com SEARCH citations. */
export function formatSearchTimeline(citations: readonly DeepSeekCitation[]): string {
  const sources = searchTimelineSources(citations)
  if (sources.length === 0) return ''
  const heading = sources.length === 1 ? 'Found 1 source' : `Found ${sources.length} sources`
  return `${heading}\n\n${sources.map((source, index) => `${index + 1}. [${source.title}](${source.url})`).join('\n')}`
}
