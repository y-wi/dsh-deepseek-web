import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { accountHash, type DeepSeekWebHttpClient } from './request.ts'
import { loadProtocolCore, throwIfProtocolError } from './protocol/core.ts'
import type { DeepSeekAccount } from './types.ts'

export async function currentUser(
  http: DeepSeekWebHttpClient,
  credential: string,
  signal?: AbortSignal,
): Promise<DeepSeekAccount> {
  const core = await loadProtocolCore()
  const descriptor = core.buildRequest({ type: 'current_user', client: http.clientContext() })
  const raw = await http.send(descriptor, credential, signal)
  const parsed = core.parseResponse({
    operation: 'current_user',
    status: raw.status,
    headers: raw.headers,
    bodyText: raw.text,
    body: raw.body,
  })
  throwIfProtocolError(parsed)
  if (parsed.response.type !== 'account') {
    throw new DeepSeekWebError('DeepSeek Web account id missing', ERROR_CODES.PROTOCOL)
  }
  return { id: parsed.response.id, accountHash: accountHash(parsed.response.id) }
}
