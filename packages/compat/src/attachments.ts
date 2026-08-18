import {
  IMAGE_MEDIA_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_POLL_DEADLINE_MS,
  UPLOAD_POLL_INTERVAL_MS,
} from './constants.ts'
import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { loadProtocolCore, throwIfProtocolError } from './protocol/core.ts'
import type { PowWorkerPool } from './pow/pool.ts'
import type { DeepSeekWebHttpClient } from './request.ts'
import type { DeepSeekAttachmentRef, DeepSeekAttachmentUpload, PowChallenge } from './types.ts'

const IMAGE_MEDIA = new Set<string>(IMAGE_MEDIA_TYPES)

export class DeepSeekFileIdCache {
  private readonly map = new Map<string, string>()

  private key(accountHash: string, attachmentId: string): string {
    return `${accountHash}\0${attachmentId}`
  }

  get(accountHash: string, attachmentId: string): string | undefined {
    return this.map.get(this.key(accountHash, attachmentId))
  }

  set(accountHash: string, attachmentId: string, fileId: string): void {
    this.map.set(this.key(accountHash, attachmentId), fileId)
  }

  delete(accountHash: string, attachmentId: string): void {
    this.map.delete(this.key(accountHash, attachmentId))
  }
}

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  return 'png'
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DeepSeekWebError('request aborted', ERROR_CODES.TIMEOUT)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DeepSeekWebError('request aborted', ERROR_CODES.TIMEOUT))
    }
    signal?.addEventListener('abort', onAbort)
  })
}

async function parseAttachment(
  http: DeepSeekWebHttpClient,
  credential: string,
  operation: 'upload_attachment' | 'fetch_attachment',
  raw: { status: number; headers: Array<{ name: string; value?: string | null }>; text: string; body: Uint8Array },
): Promise<{ fileId: string; status: string }> {
  const core = await loadProtocolCore()
  const parsed = core.parseResponse({
    operation,
    status: raw.status,
    headers: raw.headers,
    bodyText: raw.text,
    body: raw.body,
  })
  throwIfProtocolError(parsed)
  if (parsed.response.type !== 'attachment') {
    throw new DeepSeekWebError('DeepSeek Web upload response missing file id', ERROR_CODES.PROTOCOL)
  }
  return { fileId: parsed.response.fileId, status: parsed.response.status }
}

async function pollUntilReady(
  http: DeepSeekWebHttpClient,
  credential: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<void> {
  const core = await loadProtocolCore()
  const deadline = Date.now() + UPLOAD_POLL_DEADLINE_MS
  while (true) {
    if (signal?.aborted) throw new DeepSeekWebError('request aborted', ERROR_CODES.TIMEOUT)
    const descriptor = core.buildRequest({
      type: 'fetch_attachment',
      client: http.clientContext(),
      fileId,
    })
    const raw = await http.send(descriptor, credential, signal)
    const payload = await parseAttachment(http, credential, 'fetch_attachment', raw)
    if (payload.status === 'SUCCESS') return
    if (payload.status === 'FAILED') {
      throw new DeepSeekWebError(
        'DeepSeek Web failed to parse the uploaded image',
        ERROR_CODES.UNSUPPORTED_IMAGE,
      )
    }
    if (Date.now() >= deadline) {
      throw new DeepSeekWebError('DeepSeek Web image parse timed out', ERROR_CODES.TIMEOUT)
    }
    await sleep(UPLOAD_POLL_INTERVAL_MS, signal)
  }
}

export async function uploadAttachment(
  http: DeepSeekWebHttpClient,
  pool: PowWorkerPool,
  request: DeepSeekAttachmentUpload,
): Promise<DeepSeekAttachmentRef> {
  if (!IMAGE_MEDIA.has(request.mediaType)) {
    throw new DeepSeekWebError(
      `DeepSeek Web image upload does not accept ${request.mediaType}`,
      ERROR_CODES.UNSUPPORTED_IMAGE,
    )
  }
  if (request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new DeepSeekWebError(
      'DeepSeek Web image exceeds the upload size limit',
      ERROR_CODES.UNSUPPORTED_IMAGE,
    )
  }
  const core = await loadProtocolCore()
  const powDescriptor = core.buildRequest({
    type: 'create_pow_challenge',
    target: 'upload_attachment',
    client: http.clientContext(),
  })
  const powRaw = await http.send(powDescriptor, request.credential, request.signal)
  const powParsed = core.parseResponse({
    operation: 'create_pow_challenge',
    status: powRaw.status,
    headers: powRaw.headers,
    bodyText: powRaw.text,
    body: powRaw.body,
  })
  throwIfProtocolError(powParsed)
  if (powParsed.response.type !== 'pow_challenge') {
    throw new DeepSeekWebError('invalid PoW challenge', ERROR_CODES.POW)
  }
  const challenge: PowChallenge = {
    algorithm: powParsed.response.algorithm,
    challenge: powParsed.response.challenge,
    salt: powParsed.response.salt,
    signature: powParsed.response.signature,
    expireAt: powParsed.response.expireAt,
    difficulty: powParsed.response.difficulty,
  }
  const solved = await pool.solve(challenge, { signal: request.signal })
  const header = core.encodePowHeader(challenge, solved.nonce, 'upload_attachment')
  const filename = request.name?.replace(/[\\/]/g, '_') || `image.${extensionFor(request.mediaType)}`
  const form = new FormData()
  form.append('file', new Blob([request.bytes], { type: request.mediaType }), filename)
  const uploadDescriptor = core.buildRequest({
    type: 'upload_attachment',
    client: http.clientContext(),
    pow: { header },
    fileSize: request.bytes.byteLength,
    model: request.modelType,
    thinking: request.thinkingEnabled,
  })
  const uploaded = await http.send(uploadDescriptor, request.credential, request.signal, form)
  const payload = await parseAttachment(http, request.credential, 'upload_attachment', uploaded)
  await pollUntilReady(http, request.credential, payload.fileId, request.signal)
  return { fileId: payload.fileId }
}
