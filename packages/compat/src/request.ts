import { createHash } from 'node:crypto'
import {
  HTTP_CONNECT_TIMEOUT_MS,
  HTTP_IDLE_TIMEOUT_MS,
  MAX_ERROR_BYTES,
  MAX_JSON_BYTES,
} from './constants.ts'
import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import type { ProtocolHeader, ProtocolRequest } from './protocol/core.ts'
import { redactSensitiveText } from './redaction.ts'
import type { ClientFingerprintConfig } from './types.ts'

export interface TransportResult {
  status: number
  headers: ProtocolHeader[]
  body: Uint8Array
  text: string
  response: Response
}

function timezoneOffsetSeconds(): number {
  return -new Date().getTimezoneOffset() * 60
}

export function accountHash(accountId: string): string {
  return createHash('sha256').update(`deepseek-web-account\0${accountId}`).digest('hex')
}

export function responseHeaders(headers: Headers): ProtocolHeader[] {
  const out: ProtocolHeader[] = []
  headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower === 'authorization' || lower === 'cookie' || lower === 'set-cookie') return
    out.push({ name, value })
  })
  return out
}

export function applyTransportHeaders(
  descriptor: ProtocolRequest,
  credential: string,
  userAgentOverride?: string,
): Headers {
  const headers = new Headers()
  for (const header of descriptor.headers) {
    if (header.placeholder === 'authorization') {
      if (descriptor.requiresCredential) {
        headers.set('Authorization', `Bearer ${credential.replace(/^Bearer\s+/i, '')}`)
      }
      continue
    }
    if (header.value != null && header.value.length > 0) {
      headers.set(header.name, header.value)
    }
  }
  headers.set('User-Agent', userAgentOverride ?? descriptor.suggestedUserAgent)
  return headers
}

async function readLimited(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    if (signal?.aborted) throw new DeepSeekWebError('request aborted', ERROR_CODES.TIMEOUT)
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) throw new DeepSeekWebError('response too large', ERROR_CODES.PROTOCOL)
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export class DeepSeekWebHttpClient {
  constructor(
    readonly baseURL?: string,
    readonly fingerprint?: ClientFingerprintConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  clientContext() {
    return {
      locale: this.fingerprint?.locale,
      timezoneOffsetSeconds: timezoneOffsetSeconds(),
      clientVersion: this.fingerprint?.clientVersion,
      bundleId: this.fingerprint?.bundleId,
    }
  }

  async send(
    descriptor: ProtocolRequest,
    credential: string,
    signal?: AbortSignal,
    form?: FormData,
  ): Promise<TransportResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_CONNECT_TIMEOUT_MS + HTTP_IDLE_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const headers = applyTransportHeaders(descriptor, credential, this.fingerprint?.userAgent)
      let body: string | FormData | undefined
      if (form !== undefined) {
        headers.delete('Content-Type')
        body = form
      } else if (descriptor.bodyText != null && descriptor.bodyKind === 'json') {
        body = descriptor.bodyText
      }
      const origin = this.baseURL ?? descriptor.origin
      const response = await this.fetchImpl(new URL(descriptor.path, origin), {
        method: descriptor.method.toUpperCase(),
        headers,
        body,
        signal: controller.signal,
        redirect: 'manual',
      })
      const headerList = responseHeaders(response.headers)
      const contentType = response.headers.get('content-type') ?? ''
      if (
        descriptor.responseKind === 'sse'
        && response.ok
        && contentType.includes('text/event-stream')
      ) {
        return {
          status: response.status,
          headers: headerList,
          body: new Uint8Array(),
          text: '',
          response,
        }
      }
      const maxBytes = descriptor.responseKind === 'sse' || !response.ok
        ? MAX_ERROR_BYTES
        : Math.max(1, descriptor.maxResponseBytes || MAX_JSON_BYTES)
      const bytes = await readLimited(response, maxBytes, signal)
      return {
        status: response.status,
        headers: headerList,
        body: bytes,
        text: new TextDecoder().decode(bytes),
        response,
      }
    } catch (error) {
      if (error instanceof DeepSeekWebError) throw error
      if ((error as { name?: string }).name === 'AbortError') {
        throw new DeepSeekWebError('DeepSeek Web request timed out', ERROR_CODES.TIMEOUT, { cause: error })
      }
      throw new DeepSeekWebError(redactSensitiveText(String(error)), ERROR_CODES.HTTP, { cause: error })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}
