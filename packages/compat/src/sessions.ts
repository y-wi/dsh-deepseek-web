import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { type DeepSeekWebHttpClient } from './request.ts'
import { loadProtocolCore, throwIfProtocolError } from './protocol/core.ts'
import type { DeepSeekRemoteSessionPage } from './types.ts'

export async function listSessions(
  http: DeepSeekWebHttpClient,
  credential: string,
  options?: {
    cursor?: string
    limit?: number
    signal?: AbortSignal
  },
): Promise<DeepSeekRemoteSessionPage> {
  if (options?.signal?.aborted) {
    throw new DeepSeekWebError('request aborted', ERROR_CODES.TIMEOUT)
  }
  const core = await loadProtocolCore()
  const descriptor = core.buildRequest({
    type: 'list_sessions',
    client: http.clientContext(),
    cursor: options?.cursor,
    limit: options?.limit,
  })
  const raw = await http.send(descriptor, credential, options?.signal)
  const parsed = core.parseResponse({
    operation: 'list_sessions',
    status: raw.status,
    headers: raw.headers,
    bodyText: raw.text,
    body: raw.body,
  })
  throwIfProtocolError(parsed)
  if (parsed.response.type !== 'session_list') {
    throw new DeepSeekWebError('DeepSeek Web session list missing', ERROR_CODES.PROTOCOL)
  }
  return {
    items: parsed.response.items,
    ...(parsed.response.nextCursor === undefined ? {} : { nextCursor: parsed.response.nextCursor }),
  }
}
