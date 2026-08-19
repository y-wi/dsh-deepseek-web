import { currentUser } from './account.ts'
import { completeTurn, solveCompletionPow } from './completion.ts'
import { PowWorkerPool } from './pow/pool.ts'
import { DeepSeekWebHttpClient } from './request.ts'
import { createSession } from './session.ts'
import { listSessions } from './sessions.ts'
import { fetchSessionHistory } from './history.ts'
import { uploadAttachment } from './attachments.ts'
import { loadProtocolCore } from './protocol/core.ts'
import type {
  ClientFingerprintConfig,
  DeepSeekAccount,
  DeepSeekAttachmentRef,
  DeepSeekAttachmentUpload,
  DeepSeekCompletionRequest,
  DeepSeekRemoteSessionHistory,
  DeepSeekRemoteSessionPage,
  DeepSeekSession,
  DeepSeekTurn,
  DeepSeekWebClient,
} from './types.ts'

export class CompatDeepSeekWebClient implements DeepSeekWebClient {
  readonly http: DeepSeekWebHttpClient
  readonly pow: PowWorkerPool

  constructor(options?: {
    baseURL?: string
    fingerprint?: ClientFingerprintConfig
    fetchImpl?: typeof fetch
    pow?: PowWorkerPool
  }) {
    this.http = new DeepSeekWebHttpClient(
      options?.baseURL,
      options?.fingerprint,
      options?.fetchImpl,
    )
    this.pow = options?.pow ?? new PowWorkerPool()
    void this.pow.warmup()
    void loadProtocolCore()
  }

  currentUser(credential: string, signal?: AbortSignal): Promise<DeepSeekAccount> {
    return currentUser(this.http, credential, signal)
  }

  createSession(credential: string, signal?: AbortSignal): Promise<DeepSeekSession> {
    return createSession(this.http, credential, signal)
  }

  solveCompletionPow(credential: string, signal?: AbortSignal): Promise<string> {
    return solveCompletionPow(this.http, this.pow, credential, signal)
  }

  complete(request: DeepSeekCompletionRequest): Promise<DeepSeekTurn> {
    return completeTurn(this.http, this.pow, request)
  }

  uploadAttachment(request: DeepSeekAttachmentUpload): Promise<DeepSeekAttachmentRef> {
    return uploadAttachment(this.http, this.pow, request)
  }

  listSessions(
    credential: string,
    options?: { cursor?: string; limit?: number; signal?: AbortSignal },
  ): Promise<DeepSeekRemoteSessionPage> {
    return listSessions(this.http, credential, options)
  }

  fetchSessionHistory(
    credential: string,
    chatSessionId: string,
    options?: { cursor?: string; limit?: number; signal?: AbortSignal },
  ): Promise<DeepSeekRemoteSessionHistory> {
    return fetchSessionHistory(this.http, credential, chatSessionId, options)
  }

  async dispose(): Promise<void> {
    await this.pow.dispose()
  }
}
