export type DeepSeekModelType = 'default' | 'expert'

export interface ClientFingerprintConfig {
  clientVersion: string
  bundleId: string
  platform: 'web'
  locale: string
  userAgent?: string
}

export interface DeepSeekAccount {
  id: string
  accountHash: string
}

export interface DeepSeekSession {
  chatSessionId: string
}

export interface DeepSeekCitation {
  citeIndex: number
  url: string
  title?: string
  siteName?: string
}

export interface DeepSeekTurn {
  requestMessageId: string
  responseMessageId: string
  reasoning: string
  text: string
  citations: DeepSeekCitation[]
  /** Official `event: title` payload; never a visible transcript fragment. */
  sessionTitle?: string
}

export interface DeepSeekStreamDelta {
  reasoning: string
  text: string
  citations: DeepSeekCitation[]
}

export interface DeepSeekCompletionRequest {
  credential: string
  chatSessionId: string
  parentMessageId?: string
  prompt: string
  modelType: DeepSeekModelType
  thinkingEnabled: boolean
  searchEnabled: boolean
  refFileIds?: readonly string[]
  signal?: AbortSignal
  onDelta?: (delta: DeepSeekStreamDelta) => void
  /** Prefetched PoW proof; completion refetches when the provider rejects a stale proof. */
  powHeader?: string
}

export interface DeepSeekAttachmentUpload {
  credential: string
  bytes: Uint8Array
  mediaType: string
  name?: string
  modelType?: DeepSeekModelType
  thinkingEnabled?: boolean
  signal?: AbortSignal
}

export interface DeepSeekAttachmentRef {
  fileId: string
}

export interface DeepSeekRemoteSessionSummary {
  chatSessionId: string
  title: string
  createdAt?: number
  updatedAt?: number
  modelType?: DeepSeekModelType
}

export interface DeepSeekRemoteSessionPage {
  items: DeepSeekRemoteSessionSummary[]
  nextCursor?: string
}

export interface DeepSeekRemoteMessage {
  role: 'user' | 'assistant'
  requestMessageId?: string
  responseMessageId?: string
  text: string
  reasoning?: string
  citations?: DeepSeekCitation[]
  createdAt?: number
  modelType?: DeepSeekModelType
  thinkingEnabled?: boolean
  searchEnabled?: boolean
}

export interface DeepSeekRemoteSessionHistory {
  session: DeepSeekRemoteSessionSummary
  messages: DeepSeekRemoteMessage[]
  nextCursor?: string
}

export interface PowChallenge {
  algorithm: string
  challenge: string
  salt: string
  signature: string
  expireAt: number
  difficulty: number
}

export interface PublicAccountInfo {
  accountHash: string
}

export interface PublicBrowserInfo {
  kind: string
  version?: string
}

export type BrowserKind = 'chrome' | 'edge' | 'brave' | 'chromium' | 'managed'

export interface BrowserCandidate {
  id: string
  kind: BrowserKind
  executable: string
  version?: string
}

export type BrowserAuthState =
  | { status: 'signed-out' }
  | { status: 'detecting-browser' }
  | { status: 'installing-browser'; progress?: number }
  | { status: 'launching-browser' }
  | { status: 'waiting-for-login' }
  | { status: 'validating' }
  | { status: 'signed-in'; account: PublicAccountInfo; browser: PublicBrowserInfo }
  | { status: 'error'; code: string; message: string }

export interface DeepSeekWebClient {
  currentUser(credential: string, signal?: AbortSignal): Promise<DeepSeekAccount>
  createSession(credential: string, signal?: AbortSignal): Promise<DeepSeekSession>
  complete(request: DeepSeekCompletionRequest): Promise<DeepSeekTurn>
  solveCompletionPow?(credential: string, signal?: AbortSignal): Promise<string>
  uploadAttachment?(request: DeepSeekAttachmentUpload): Promise<DeepSeekAttachmentRef>
  listSessions(
    credential: string,
    options?: { cursor?: string; limit?: number; signal?: AbortSignal },
  ): Promise<DeepSeekRemoteSessionPage>
  fetchSessionHistory(
    credential: string,
    chatSessionId: string,
    options?: { cursor?: string; limit?: number; signal?: AbortSignal },
  ): Promise<DeepSeekRemoteSessionHistory>
}
