import { DeepSeekWebError, ERROR_CODES } from '../errors.ts'
import type { DeepSeekCitation, DeepSeekTurn, PowChallenge } from '../types.ts'
import { loadWasmNative, type WasmNative, type WasmStreamAssembler } from './native.ts'

export const PROTOCOL_ABI_VERSION = 1

export interface ProtocolClientContext {
  locale?: string
  timezoneOffsetSeconds?: number
  clientVersion?: string
  bundleId?: string
}

export interface ProtocolHeader {
  name: string
  value?: string | null
  placeholder?: string | null
}

export interface ProtocolRequest {
  schemaVersion: number
  method: 'get' | 'post'
  origin: string
  path: string
  headers: ProtocolHeader[]
  bodyText?: string | null
  bodyKind: 'none' | 'json' | 'multipart'
  responseKind: 'json' | 'sse'
  requiresCredential: boolean
  suggestedUserAgent: string
}

export type BuildRequestCommand =
  | { type: 'current_user'; client?: ProtocolClientContext }
  | { type: 'create_pow_challenge'; target: 'completion' | 'upload_attachment'; client?: ProtocolClientContext }
  | { type: 'create_session'; client?: ProtocolClientContext }
  | {
    type: 'completion'
    client?: ProtocolClientContext
    input: {
      sessionId: string
      parentMessageId?: string
      prompt: string
      attachments?: string[]
      model?: string
      thinking?: boolean
      search?: boolean
    }
    pow: { header: string }
  }
  | {
    type: 'upload_attachment'
    client?: ProtocolClientContext
    pow: { header: string }
    fileSize: number
    model?: string
    thinking?: boolean
  }
  | { type: 'fetch_attachment'; client?: ProtocolClientContext; fileId: string }

export type ProtocolOperation =
  | 'current_user'
  | 'create_pow_challenge'
  | 'create_session'
  | 'completion'
  | 'upload_attachment'
  | 'fetch_attachment'

export interface ProtocolError {
  code: string
  dshCode: string
  safeMessage: string
  status?: number
  retryAfterMs?: number
  remoteRequestId?: string
}

export type ProtocolResponse =
  | { type: 'account'; id: string }
  | { type: 'session'; sessionId: string }
  | {
    type: 'pow_challenge'
    algorithm: string
    challenge: string
    salt: string
    signature: string
    expireAt: number
    difficulty: number
  }
  | { type: 'attachment'; fileId: string; status: string }
  | { type: 'sse_ready' }

export interface ParseResponseOutput {
  schemaVersion: number
  ok: boolean
  response?: ProtocolResponse
  error?: ProtocolError
}

export class ProtocolStreamAssembler {
  constructor(private readonly inner: WasmStreamAssembler) {}

  processEvent(event: string, data: string): void {
    try {
      this.inner.push(event, data)
    } catch (error) {
      rethrowWasm(error)
    }
  }

  takeDelta(): { reasoning: string; text: string; citations: DeepSeekCitation[] } {
    const parsed = JSON.parse(this.inner.take_delta()) as {
      reasoning?: string
      text?: string
      citations?: Array<{ citeIndex: number; url: string; title?: string; siteName?: string }>
    }
    return {
      reasoning: parsed.reasoning ?? '',
      text: parsed.text ?? '',
      citations: (parsed.citations ?? []).map(item => ({
        citeIndex: item.citeIndex,
        url: item.url,
        title: item.title,
        siteName: item.siteName,
      })),
    }
  }

  finish(): DeepSeekTurn {
    try {
      const parsed = JSON.parse(this.inner.finish()) as {
        requestMessageId: string
        responseMessageId: string
        reasoning: string
        text: string
        citations: DeepSeekCitation[]
        sessionTitle?: string
      }
      return {
        requestMessageId: parsed.requestMessageId,
        responseMessageId: parsed.responseMessageId,
        reasoning: parsed.reasoning,
        text: parsed.text,
        citations: parsed.citations,
        ...(parsed.sessionTitle === undefined ? {} : { sessionTitle: parsed.sessionTitle }),
      }
    } catch (error) {
      rethrowWasm(error)
    }
  }
}

export function throwIfProtocolError(
  parsed: ParseResponseOutput,
): asserts parsed is ParseResponseOutput & { ok: true; response: ProtocolResponse } {
  if (parsed.ok && parsed.response !== undefined) return
  const error = parsed.error
  throw new DeepSeekWebError(
    error?.safeMessage ?? 'DeepSeek Web protocol error',
    error?.dshCode ?? ERROR_CODES.PROTOCOL,
    error?.status === undefined ? undefined : { status: error.status },
  )
}

export class ProtocolCore {
  constructor(private readonly native: WasmNative) {
    const version = native.protocol_abi_version()
    if (version !== PROTOCOL_ABI_VERSION) {
      throw new DeepSeekWebError(
        `plugin JS ABI v${PROTOCOL_ABI_VERSION} / WASM ABI v${version}`,
        ERROR_CODES.PROTOCOL_CORE_MISMATCH,
      )
    }
  }

  get abiVersion(): number {
    return this.native.protocol_abi_version()
  }

  buildRequest(command: BuildRequestCommand): ProtocolRequest {
    try {
      return JSON.parse(
        this.native.build_request_json(JSON.stringify({ schemaVersion: PROTOCOL_ABI_VERSION, ...command })),
      ) as ProtocolRequest
    } catch (error) {
      rethrowWasm(error)
    }
  }

  parseResponse(input: {
    operation: ProtocolOperation
    status: number
    headers: ProtocolHeader[]
    bodyText?: string
    body?: Uint8Array
  }): ParseResponseOutput {
    try {
      const meta = JSON.stringify({
        schemaVersion: PROTOCOL_ABI_VERSION,
        operation: input.operation,
        status: input.status,
        headers: input.headers,
        bodyText: input.bodyText,
      })
      return JSON.parse(
        this.native.parse_response_json(meta, input.body ?? new Uint8Array()),
      ) as ParseResponseOutput
    } catch (error) {
      rethrowWasm(error)
    }
  }

  createStream(): ProtocolStreamAssembler {
    return new ProtocolStreamAssembler(new this.native.WasmStreamAssembler())
  }

  pathlessFixture(): string {
    try {
      return this.native.pathless_sse_fixture()
    } catch (error) {
      rethrowWasm(error)
    }
  }

  encodePowHeader(challenge: PowChallenge, nonce: number, target: 'completion' | 'upload_attachment' = 'completion'): string {
    try {
      return this.native.encode_pow_header_json(JSON.stringify({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        signature: challenge.signature,
        expire_at: challenge.expireAt,
        difficulty: challenge.difficulty,
      }), BigInt(nonce), target)
    } catch (error) {
      rethrowWasm(error)
    }
  }
}

let corePromise: Promise<ProtocolCore> | undefined
let syncCore: ProtocolCore | undefined

export async function loadProtocolCore(): Promise<ProtocolCore> {
  corePromise ??= (async () => {
    const native = await loadWasmNative()
    if (native === undefined) {
      throw new DeepSeekWebError(
        'DeepSeek Web protocol WASM is missing; rebuild with pnpm build:core',
        ERROR_CODES.PROTOCOL_CORE_MISMATCH,
      )
    }
    const core = new ProtocolCore(native)
    syncCore = core
    return core
  })()
  return corePromise
}

export function getProtocolCoreSync(): ProtocolCore {
  if (syncCore === undefined) {
    throw new DeepSeekWebError(
      'DeepSeek Web protocol core is not initialized',
      ERROR_CODES.PROTOCOL_CORE_MISMATCH,
    )
  }
  return syncCore
}

function rethrowWasm(error: unknown): never {
  if (error instanceof DeepSeekWebError) throw error
  const message = error instanceof Error ? error.message : String(error)
  try {
    const parsed = JSON.parse(message) as ParseResponseOutput
    if (parsed?.error?.dshCode) {
      throw new DeepSeekWebError(
        parsed.error.safeMessage,
        parsed.error.dshCode,
        parsed.error.status === undefined ? undefined : { status: parsed.error.status },
      )
    }
  } catch (inner) {
    if (inner instanceof DeepSeekWebError) throw inner
  }
  throw new DeepSeekWebError(message, ERROR_CODES.PROTOCOL)
}
