import { DeepSeekWebError, ERROR_CODES } from './errors.ts'
import { loadProtocolCore, throwIfProtocolError } from './protocol/core.ts'
import type { DeepSeekWebHttpClient } from './request.ts'
import type { DeepSeekCompletionRequest, DeepSeekTurn, PowChallenge } from './types.ts'
import { PowWorkerPool } from './pow/pool.ts'
import { readSseResponse } from './sse.ts'

function asPowChallenge(value: {
  algorithm: string
  challenge: string
  salt: string
  signature: string
  expireAt: number
  difficulty: number
}): PowChallenge {
  return {
    algorithm: value.algorithm,
    challenge: value.challenge,
    salt: value.salt,
    signature: value.signature,
    expireAt: value.expireAt,
    difficulty: value.difficulty,
  }
}

export async function solveCompletionPow(
  http: DeepSeekWebHttpClient,
  pool: PowWorkerPool,
  credential: string,
  signal?: AbortSignal,
): Promise<string> {
  const core = await loadProtocolCore()
  const descriptor = core.buildRequest({
    type: 'create_pow_challenge',
    target: 'completion',
    client: http.clientContext(),
  })
  const raw = await http.send(descriptor, credential, signal)
  const parsed = core.parseResponse({
    operation: 'create_pow_challenge',
    status: raw.status,
    headers: raw.headers,
    bodyText: raw.text,
    body: raw.body,
  })
  throwIfProtocolError(parsed)
  if (parsed.response.type !== 'pow_challenge') {
    throw new DeepSeekWebError('invalid PoW challenge', ERROR_CODES.POW)
  }
  const challenge = asPowChallenge(parsed.response)
  const solved = await pool.solve(challenge, { signal })
  return solved.header ?? core.encodePowHeader(challenge, solved.nonce, 'completion')
}

export async function completeTurn(
  http: DeepSeekWebHttpClient,
  pool: PowWorkerPool,
  request: DeepSeekCompletionRequest,
  powAttempt = 0,
): Promise<DeepSeekTurn> {
  const core = await loadProtocolCore()
  const header = request.powHeader !== undefined && powAttempt === 0
    ? request.powHeader
    : await solveCompletionPow(http, pool, request.credential, request.signal)
  const descriptor = core.buildRequest({
    type: 'completion',
    client: http.clientContext(),
    input: {
      sessionId: request.chatSessionId,
      parentMessageId: request.parentMessageId,
      prompt: request.prompt,
      attachments: [...(request.refFileIds ?? [])],
      model: request.modelType,
      thinking: request.thinkingEnabled,
      search: request.searchEnabled,
    },
    pow: { header },
  })
  try {
    const raw = await http.send(descriptor, request.credential, request.signal)
    const classified = core.parseResponse({
      operation: 'completion',
      status: raw.status,
      headers: raw.headers,
      bodyText: raw.text,
      body: raw.body,
    })
    if (!classified.ok) {
      throwIfProtocolError(classified)
    }
    return await readSseResponse(raw.response, request.signal, 180_000, request.onDelta)
  } catch (error) {
    if (error instanceof DeepSeekWebError && error.code === ERROR_CODES.POW && powAttempt === 0) {
      return completeTurn(http, pool, { ...request, powHeader: undefined }, 1)
    }
    if (error instanceof DeepSeekWebError && error.code === ERROR_CODES.POW) {
      throw new DeepSeekWebError('DeepSeek Web rejected PoW after retry', ERROR_CODES.POW_REJECTED, {
        cause: error,
      })
    }
    throw error
  }
}
