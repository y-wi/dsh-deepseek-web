export const LIST_CACHE_TTL_MS = 15_000
export const HISTORY_CACHE_TTL_MS = 30_000

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class RemoteSessionCache {
  private readonly lists = new Map<string, CacheEntry<unknown>>()
  private readonly histories = new Map<string, CacheEntry<unknown>>()
  private readonly mirrors = new Map<string, string>()
  private readonly listFlights = new Map<string, Promise<unknown>>()
  private readonly historyFlights = new Map<string, Promise<unknown>>()
  private readonly materializeFlights = new Map<string, Promise<unknown>>()
  private readonly forkFlights = new Map<string, Promise<unknown>>()

  clear(): void {
    this.lists.clear()
    this.histories.clear()
    this.mirrors.clear()
    this.listFlights.clear()
    this.historyFlights.clear()
    this.materializeFlights.clear()
    this.forkFlights.clear()
  }

  listKey(accountHash: string): string {
    return accountHash
  }

  historyKey(accountHash: string, chatSessionId: string): string {
    return `${accountHash}:${chatSessionId}`
  }

  mirrorKey(accountHash: string, chatSessionId: string): string {
    return this.historyKey(accountHash, chatSessionId)
  }

  forkKey(sourceSessionId: string, messageId: string, workspaceId: string): string {
    return `${sourceSessionId}:${messageId}:${workspaceId}`
  }

  getList<T>(accountHash: string, now = Date.now()): T | undefined {
    return this.read(this.lists, this.listKey(accountHash), now)
  }

  setList<T>(accountHash: string, value: T, now = Date.now()): void {
    this.lists.set(this.listKey(accountHash), { value, expiresAt: now + LIST_CACHE_TTL_MS })
  }

  invalidateList(accountHash: string): void {
    this.lists.delete(this.listKey(accountHash))
  }

  getHistory<T>(accountHash: string, chatSessionId: string, now = Date.now()): T | undefined {
    return this.read(this.histories, this.historyKey(accountHash, chatSessionId), now)
  }

  setHistory<T>(accountHash: string, chatSessionId: string, value: T, now = Date.now()): void {
    this.histories.set(this.historyKey(accountHash, chatSessionId), {
      value,
      expiresAt: now + HISTORY_CACHE_TTL_MS,
    })
  }

  invalidateHistory(accountHash: string, chatSessionId: string): void {
    this.histories.delete(this.historyKey(accountHash, chatSessionId))
  }

  getMirror(accountHash: string, chatSessionId: string): string | undefined {
    return this.mirrors.get(this.mirrorKey(accountHash, chatSessionId))
  }

  setMirror(accountHash: string, chatSessionId: string, sessionId: string): void {
    this.mirrors.set(this.mirrorKey(accountHash, chatSessionId), sessionId)
  }

  rememberFork(key: string, childId: string): void {
    this.mirrors.set(`fork:${key}`, childId)
  }

  getFork(key: string): string | undefined {
    return this.mirrors.get(`fork:${key}`)
  }

  singleFlight<T>(bucket: 'list' | 'history' | 'materialize' | 'fork', key: string, run: () => Promise<T>): Promise<T> {
    const flights = this.flightMap(bucket)
    const existing = flights.get(key) as Promise<T> | undefined
    if (existing !== undefined) return existing
    const pending = run().finally(() => {
      if (flights.get(key) === pending) flights.delete(key)
    })
    flights.set(key, pending)
    return pending
  }

  private flightMap(bucket: 'list' | 'history' | 'materialize' | 'fork'): Map<string, Promise<unknown>> {
    if (bucket === 'list') return this.listFlights
    if (bucket === 'history') return this.historyFlights
    if (bucket === 'materialize') return this.materializeFlights
    return this.forkFlights
  }

  private read<T>(store: Map<string, CacheEntry<unknown>>, key: string, now: number): T | undefined {
    const hit = store.get(key)
    if (hit === undefined) return undefined
    if (hit.expiresAt <= now) {
      store.delete(key)
      return undefined
    }
    return hit.value as T
  }
}
