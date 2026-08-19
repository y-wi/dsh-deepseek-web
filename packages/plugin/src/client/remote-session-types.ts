export interface RemoteSessionSummaryView {
  chatSessionId: string
  title: string
  updatedAt?: number
  modelType?: 'default' | 'expert'
}

export type RemoteSessionsState =
  | { phase: 'idle'; items: RemoteSessionSummaryView[] }
  | { phase: 'signed-out'; items: RemoteSessionSummaryView[] }
  | { phase: 'loading'; items: RemoteSessionSummaryView[] }
  | { phase: 'ready'; items: RemoteSessionSummaryView[]; nextCursor?: string }
  | { phase: 'loading-more'; items: RemoteSessionSummaryView[]; nextCursor?: string }
  | { phase: 'error'; items: RemoteSessionSummaryView[]; error: string; nextCursor?: string }

export interface RemoteSessionPageView {
  items: RemoteSessionSummaryView[]
  nextCursor?: string
}

export interface MaterializeView {
  sessionId: string
  created?: boolean
  reconciled?: string
}

export interface RemoteSessionsApi {
  status(signal?: AbortSignal): Promise<{ status: string }>
  login?(signal?: AbortSignal): Promise<void>
  list(options?: {
    cursor?: string
    refresh?: boolean
    signal?: AbortSignal
  }): Promise<RemoteSessionPageView>
  materialize(chatSessionId: string, signal?: AbortSignal): Promise<MaterializeView>
}
