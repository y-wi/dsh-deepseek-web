import type { IncomingMessage } from 'node:http'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function trustedPluginRequest(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress
  if (remote === undefined || !LOOPBACK.has(remote)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const host = req.headers.host
  if (host === undefined || host.length === 0) return false
  const origin = req.headers.origin
  if (origin !== undefined && origin.length > 0) {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

export function pluginResponseHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-type': 'application/json; charset=utf-8',
  }
}
