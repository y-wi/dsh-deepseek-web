import { LOGIN_PATH, materializePath, pluginFetch, PluginApiError, sessionsListPath, STATUS_PATH } from './api.ts'
import type {
  RemoteSessionPageView,
  RemoteSessionsApi,
  RemoteSessionsState,
  RemoteSessionSummaryView,
} from './remote-session-types.ts'

export const AUTO_REFRESH_MIN_MS = 1_000
export const AUTO_REFRESH_MAX_MS = 4_000
export const LOGIN_POLL_MS = 400

const SIGNING_IN = new Set([
  'detecting-browser',
  'installing-browser',
  'launching-browser',
  'waiting-for-login',
  'validating',
])

function mergeItems(
  existing: readonly RemoteSessionSummaryView[],
  incoming: readonly RemoteSessionSummaryView[],
): RemoteSessionSummaryView[] {
  const seen = new Set(existing.map(item => item.chatSessionId))
  const next = [...existing]
  for (const item of incoming) {
    if (seen.has(item.chatSessionId)) continue
    seen.add(item.chatSessionId)
    next.push(item)
  }
  return next
}

export function nextAutoRefreshDelay(
  minMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  if (maxMs <= minMs) return minMs
  return Math.round(minMs + random() * (maxMs - minMs))
}

function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function defaultRemoteSessionsApi(): RemoteSessionsApi {
  return {
    async status(signal) {
      return await pluginFetch(STATUS_PATH, { signal }) as { status: string }
    },
    async login(signal) {
      await pluginFetch(LOGIN_PATH, {
        method: 'POST',
        body: JSON.stringify({ resetProfile: true }),
        signal,
      })
    },
    async list(options) {
      return await pluginFetch(sessionsListPath({
        cursor: options?.cursor,
        refresh: options?.refresh,
      }), { signal: options?.signal }) as RemoteSessionPageView
    },
    async materialize(chatSessionId, signal) {
      return await pluginFetch(materializePath(chatSessionId), {
        method: 'POST',
        body: '{}',
        signal,
      }) as { sessionId: string; created?: boolean; reconciled?: string }
    },
  }
}

export class RemoteSessionsController {
  private generation = 0
  private inflight: AbortController | undefined
  private loginAbort: AbortController | undefined
  private syncTimer: ReturnType<typeof setTimeout> | undefined
  private syncing = false
  private readonly listeners = new Set<() => void>()
  private state: RemoteSessionsState = { phase: 'idle', items: [] }
  private readonly autoRefreshMinMs: number
  private readonly autoRefreshMaxMs: number
  private readonly loginPollMs: number
  private readonly random: () => number
  private readonly delay: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(
    private readonly api: RemoteSessionsApi = defaultRemoteSessionsApi(),
    options?: {
      autoRefreshMinMs?: number
      autoRefreshMaxMs?: number
      loginPollMs?: number
      random?: () => number
      delay?: (ms: number, signal?: AbortSignal) => Promise<void>
    },
  ) {
    this.autoRefreshMinMs = options?.autoRefreshMinMs ?? AUTO_REFRESH_MIN_MS
    this.autoRefreshMaxMs = options?.autoRefreshMaxMs ?? AUTO_REFRESH_MAX_MS
    this.loginPollMs = options?.loginPollMs ?? LOGIN_POLL_MS
    this.random = options?.random ?? Math.random
    this.delay = options?.delay ?? defaultDelay
  }

  getSnapshot(): RemoteSessionsState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  startBackgroundSync(): void {
    if (this.syncing) return
    this.syncing = true
    this.armBackgroundSync()
  }

  stopBackgroundSync(): void {
    this.syncing = false
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer)
      this.syncTimer = undefined
    }
  }

  cancel(): void {
    this.generation += 1
    this.inflight?.abort()
    this.inflight = undefined
    this.loginAbort?.abort()
    this.loginAbort = undefined
    if (this.state.phase === 'loading' || this.state.phase === 'loading-more') {
      this.emit(this.state.items.length === 0
        ? { phase: 'idle', items: [] }
        : { phase: 'ready', items: this.state.items, nextCursor: 'nextCursor' in this.state ? this.state.nextCursor : undefined })
    }
  }

  dispose(): void {
    this.stopBackgroundSync()
    this.cancel()
    this.listeners.clear()
  }

  async ensureLoaded(refresh = false): Promise<void> {
    if (!refresh && (this.state.phase === 'ready' || this.inflight !== undefined)) return
    await this.load({ refresh })
  }

  async refresh(): Promise<void> {
    await this.load({ refresh: true })
  }

  async retry(): Promise<void> {
    await this.load({ refresh: this.state.items.length === 0 })
  }

  async loadMore(): Promise<void> {
    if (this.state.phase !== 'ready' || this.state.nextCursor === undefined) return
    await this.load({ cursor: this.state.nextCursor })
  }

  async beginLogin(): Promise<void> {
    this.loginAbort?.abort()
    const controller = new AbortController()
    this.loginAbort = controller
    try {
      await this.api.login?.(controller.signal)
      if (controller.signal.aborted) return
      this.emit({ phase: 'loading', items: [] })
      const signedIn = await this.waitForSignedIn(controller.signal)
      if (controller.signal.aborted || !signedIn) {
        if (!controller.signal.aborted) this.emit({ phase: 'signed-out', items: [] })
        return
      }
      await this.load({ refresh: true })
    } catch (error) {
      if (controller.signal.aborted) return
      const code = error instanceof PluginApiError ? error.code : undefined
      if (code === 'MISSING_CREDENTIAL') {
        this.emit({ phase: 'signed-out', items: [] })
        return
      }
      this.emit({
        phase: 'error',
        items: [],
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (this.loginAbort === controller) this.loginAbort = undefined
    }
  }

  async openRemote(chatSessionId: string): Promise<{ sessionId: string; reconciled?: string }> {
    return this.api.materialize(chatSessionId)
  }

  private emit(state: RemoteSessionsState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }

  private armBackgroundSync(): void {
    if (!this.syncing) return
    if (this.syncTimer !== undefined) clearTimeout(this.syncTimer)
    const wait = nextAutoRefreshDelay(this.autoRefreshMinMs, this.autoRefreshMaxMs, this.random)
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined
      void this.tickBackgroundSync()
    }, wait)
  }

  private async tickBackgroundSync(): Promise<void> {
    if (!this.syncing) return
    if (this.inflight === undefined && this.loginAbort === undefined
      && this.state.phase !== 'loading' && this.state.phase !== 'loading-more') {
      await this.load({ refresh: true })
    }
    this.armBackgroundSync()
  }

  private async waitForSignedIn(signal: AbortSignal): Promise<boolean> {
    let sawSigningIn = false
    while (!signal.aborted) {
      const status = await this.api.status(signal)
      if (signal.aborted) return false
      if (status.status === 'signed-in') return true
      if (status.status === 'error') {
        const message = (status as { message?: unknown }).message
        throw new Error(typeof message === 'string' ? message : 'login failed')
      }
      if (SIGNING_IN.has(status.status)) sawSigningIn = true
      else if (sawSigningIn && status.status === 'signed-out') return false
      await this.delay(this.loginPollMs, signal)
    }
    return false
  }

  private async load(options: { refresh?: boolean; cursor?: string }): Promise<void> {
    const gen = ++this.generation
    this.inflight?.abort()
    const controller = new AbortController()
    this.inflight = controller
    const kept = this.state.items
    const keepVisible = options.cursor === undefined && kept.length > 0
    if (!keepVisible) {
      this.emit({
        phase: options.cursor !== undefined ? 'loading-more' : 'loading',
        items: kept,
        ...(options.cursor === undefined ? {} : { nextCursor: options.cursor }),
      })
    }
    try {
      const status = await this.api.status(controller.signal)
      if (gen !== this.generation) return
      if (status.status !== 'signed-in') {
        this.emit({ phase: 'signed-out', items: [] })
        return
      }
      const page = await this.api.list({
        cursor: options.cursor,
        refresh: options.refresh === true && options.cursor === undefined,
        signal: controller.signal,
      })
      if (gen !== this.generation) return
      const items = options.cursor === undefined ? page.items : mergeItems(kept, page.items)
      this.emit({ phase: 'ready', items, nextCursor: page.nextCursor })
    } catch (error) {
      if (gen !== this.generation || controller.signal.aborted) return
      const code = error instanceof PluginApiError ? error.code : undefined
      if (code === 'MISSING_CREDENTIAL') {
        this.emit({ phase: 'signed-out', items: kept })
        return
      }
      this.emit({
        phase: 'error',
        items: kept,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (this.inflight === controller) this.inflight = undefined
    }
  }
}
