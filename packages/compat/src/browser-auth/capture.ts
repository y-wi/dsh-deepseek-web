const MAX_BEARER_BYTES = 32 * 1024

export const DEEPSEEK_WEB_ORIGIN = 'https://chat.deepseek.com'

export function isTargetApiRequest(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
      && parsed.hostname === 'chat.deepseek.com'
      && parsed.pathname.startsWith('/api/v0/')
  } catch {
    return false
  }
}

export function extractBearer(headers: Record<string, string | undefined> | string[][] | undefined): string | undefined {
  if (headers === undefined) return undefined
  const pairs = Array.isArray(headers)
    ? headers
    : Object.entries(headers)
  for (const [name, value] of pairs) {
    if (name.toLowerCase() !== 'authorization' || typeof value !== 'string') continue
    const match = value.match(/^Bearer\s+(\S+)$/i)
    if (match?.[1] && match[1].length > 0 && match[1].length <= MAX_BEARER_BYTES && !/[\r\n]/.test(match[1])) {
      return match[1]
    }
  }
  return undefined
}

export class HeaderCorrelator {
  private readonly urls = new Map<string, string>()
  private readonly headers = new Map<string, Record<string, string | undefined>>()

  consider(requestId: string, url: string | undefined, headerBag: Record<string, string | undefined> | undefined): string | undefined {
    if (url !== undefined) this.urls.set(requestId, url)
    if (headerBag !== undefined) {
      const prev = this.headers.get(requestId) ?? {}
      this.headers.set(requestId, { ...prev, ...headerBag })
    }
    const knownUrl = this.urls.get(requestId)
    if (knownUrl === undefined) return undefined
    if (!isTargetApiRequest(knownUrl)) return undefined
    return extractBearer(this.headers.get(requestId))
  }
}
