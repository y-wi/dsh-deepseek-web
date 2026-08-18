import WebSocket from 'ws'
import { DeepSeekWebError, ERROR_CODES } from '../errors.ts'

type Handler = (method: string, params: Record<string, unknown>) => void

export class CdpSession {
  private readonly ws: WebSocket
  private id = 0
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>()
  private readonly handlers: Handler[] = []

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.on('message', data => {
      const parsed = JSON.parse(String(data)) as {
        id?: number
        method?: string
        params?: Record<string, unknown>
        error?: { message: string }
        result?: unknown
      }
      if (parsed.id !== undefined) {
        const waiter = this.pending.get(parsed.id)
        if (waiter === undefined) return
        this.pending.delete(parsed.id)
        if (parsed.error) waiter.reject(new DeepSeekWebError(parsed.error.message, ERROR_CODES.BROWSER_CDP))
        else waiter.resolve(parsed.result)
        return
      }
      if (parsed.method) {
        for (const handler of this.handlers) handler(parsed.method, parsed.params ?? {})
      }
    })
  }

  static connect(url: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        reject(new DeepSeekWebError('CDP connect timed out', ERROR_CODES.BROWSER_CDP))
      }, 8_000)
      ws.once('open', () => {
        clearTimeout(timer)
        resolve(new CdpSession(ws))
      })
      ws.once('error', error => {
        clearTimeout(timer)
        reject(new DeepSeekWebError('CDP connect failed', ERROR_CODES.BROWSER_CDP, { cause: error }))
      })
    })
  }

  onEvent(handler: Handler): () => void {
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index >= 0) this.handlers.splice(index, 1)
    }
  }

  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown> {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }

  close(): void {
    this.ws.close()
  }
}

export async function attachPage(browser: CdpSession): Promise<{ session: CdpSession; sessionId: string }> {
  const target = await browser.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
  const attached = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as {
    sessionId: string
  }
  return { session: browser, sessionId: attached.sessionId }
}
