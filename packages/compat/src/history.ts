import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { type DeepSeekWebHttpClient } from './request.ts'
import { loadProtocolCore, throwIfProtocolError } from './protocol/core.ts'
import type { DeepSeekRemoteSessionHistory } from './types.ts'

export async function fetchSessionHistory(
  http: DeepSeekWebHttpClient,
  credential: string,
  chatSessionId: string,
  options?: {
    cursor?: string
    limit?: number
    signal?: AbortSignal
  },
): Promise<DeepSeekRemoteSessionHistory> {
  if (options?.signal?.aborted) {
    throw new DeepSeekWebError('request aborted', ERROR_CODES.TIMEOUT)
  }
  const trimmed = chatSessionId.trim()
  if (trimmed.length === 0) {
    throw new DeepSeekWebError('missing session id', ERROR_CODES.REMOTE_HISTORY_INVALID)
  }
  const core = await loadProtocolCore()
  const descriptor = core.buildRequest({
    type: 'fetch_session_history',
    client: http.clientContext(),
    sessionId: trimmed,
    cursor: options?.cursor,
    limit: options?.limit,
  })
  const raw = await http.send(descriptor, credential, options?.signal)
  const parsed = core.parseResponse({
    operation: 'fetch_session_history',
    status: raw.status,
    headers: raw.headers,
    bodyText: raw.text,
    body: raw.body,
  })
  throwIfProtocolError(parsed)
  if (parsed.response.type !== 'session_history') {
    throw new DeepSeekWebError('DeepSeek Web history missing', ERROR_CODES.REMOTE_HISTORY_INVALID)
  }
  return {
    session: parsed.response.session,
    messages: parsed.response.messages,
    ...(parsed.response.nextCursor === undefined ? {} : { nextCursor: parsed.response.nextCursor }),
  }
}
