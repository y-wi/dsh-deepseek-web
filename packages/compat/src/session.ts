import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { type DeepSeekWebHttpClient } from './request.ts'
import { loadProtocolCore, throwIfProtocolError } from './protocol/core.ts'
import type { DeepSeekSession } from './types.ts'

export async function createSession(
  http: DeepSeekWebHttpClient,
  credential: string,
  signal?: AbortSignal,
): Promise<DeepSeekSession> {
  const core = await loadProtocolCore()
  const descriptor = core.buildRequest({ type: 'create_session', client: http.clientContext() })
  const raw = await http.send(descriptor, credential, signal)
  const parsed = core.parseResponse({
    operation: 'create_session',
    status: raw.status,
    headers: raw.headers,
    bodyText: raw.text,
    body: raw.body,
  })
  throwIfProtocolError(parsed)
  if (parsed.response.type !== 'session') {
    throw new DeepSeekWebError('DeepSeek Web session id missing', ERROR_CODES.REMOTE_SESSION)
  }
  return { chatSessionId: parsed.response.sessionId }
}
