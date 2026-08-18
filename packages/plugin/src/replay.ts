import { createHash } from 'node:crypto'
import type { ModelId } from './config.ts'

export interface DeepSeekWebReplayV1 {
  kind: 'deepseek-web'
  version: 1
  dshSessionId?: string
  affinity: {
    accountHash: string
    model: ModelId
  }
  remote: {
    chatSessionId: string
    responseMessageId: string
  }
  history: {
    inputPrefixHash: string
  }
  contract: {
    systemHash: string
    toolsHash: string
    thinking: boolean
    nativeSearch: boolean
  }
  provider?: {
    citations?: Array<{ citeIndex: number; url: string; title?: string; siteName?: string }>
  }
}

/**
 * Process-local 1:1 bind of a DSH session to a DeepSeek Web chat session.
 * Durable restart recovery still comes from `finish.replayState`, not a sidecar DB.
 */
export interface LiveRemoteCursor {
  dshSessionId: string
  chatSessionId: string
  parentMessageId: string
  accountHash: string
  model: ModelId
  sentCount: number
  sentHash: string
  systemHash: string
  toolsHash: string
  /** Official Web `event: title`; never written back as a chat turn. */
  sessionTitle?: string
}

export type ConversationPlan =
  | {
      kind: 'continue'
      chatSessionId: string
      parentMessageId: string
      deltaMessages: unknown[]
      contractUpdate?: { system?: string; tools?: boolean }
    }
  | { kind: 'rebuild'; reason: string }
  | { kind: 'one-shot'; purpose: 'compaction' | 'session-title' }

export function wrapReplay(response: DeepSeekWebReplayV1): { response: DeepSeekWebReplayV1 } {
  return JSON.parse(JSON.stringify({ response })) as { response: DeepSeekWebReplayV1 }
}

export function readReplay(value: unknown): DeepSeekWebReplayV1 | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const envelope = value as { response?: unknown }
  const inner = envelope.response ?? value
  if (typeof inner !== 'object' || inner === null) return undefined
  const replay = inner as DeepSeekWebReplayV1
  if (replay.kind !== 'deepseek-web' || replay.version !== 1) return undefined
  if (typeof replay.affinity?.accountHash !== 'string') return undefined
  if (replay.affinity.model !== 'default' && replay.affinity.model !== 'expert') return undefined
  if (typeof replay.remote?.chatSessionId !== 'string') return undefined
  if (typeof replay.remote.responseMessageId !== 'string') return undefined
  return replay
}

function framed(parts: string[]): string {
  return parts.map(part => `${part.length}:${part}`).join('|')
}

export function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}

function normalizeText(value: string): string {
  return value.replaceAll('\r\n', '\n')
}

export function historyPrefixHash(messages: readonly unknown[], upTo: number): string {
  const slice = messages.slice(0, upTo)
  return hashText(framed(slice.map(semanticFrame)))
}

/**
 * EasyPhy-style projection: role + source.kind + semantic content.
 * Message UUIDs and reasoning are omitted so a restored DSH session can keep
 * the same remote session identifier across tool loops and process restarts.
 */
function semanticFrame(message: unknown): string {
  const record = message as {
    role?: string
    source?: { kind?: string }
    content?: unknown
  }
  return framed([
    record.role ?? '',
    record.source?.kind ?? '',
    contentFrame(record.content),
  ])
}

function contentFrame(content: unknown): string {
  if (typeof content === 'string') return `text:${normalizeText(content)}`
  if (!Array.isArray(content)) return `unknown:${stableJson(content ?? null)}`
  return content.map(block => {
    const record = block as {
      type?: string
      text?: string
      id?: string
      name?: string
      arguments?: string
      isError?: boolean
      content?: unknown
      attachment?: { attachmentId?: string }
    }
    if (record.type === 'reasoning') return ''
    if (record.type === 'text') return `text:${normalizeText(record.text ?? '')}`
    if (record.type === 'tool-call') {
      return framed(['tool-call', record.id ?? '', record.name ?? '', record.arguments ?? ''])
    }
    if (record.type === 'tool-result') {
      return framed(['tool-result', record.id ?? '', String(record.isError ?? false), stableJson(record.content ?? '')])
    }
    if (record.type === 'image') return `image:${record.attachment?.attachmentId ?? ''}`
    return `${record.type ?? 'block'}:${stableJson(record)}`
  }).filter(Boolean).join(';')
}

export function lastModelReplay(messages: readonly unknown[], provider: string): { index: number; replay: DeepSeekWebReplayV1 } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as {
      role?: string
      source?: { kind?: string; provider?: string; replayState?: unknown }
    }
    if (message.role !== 'assistant') continue
    if (message.source?.kind !== 'model') continue
    if (message.source.provider !== provider) continue
    const replay = readReplay(message.source.replayState)
    if (replay) return { index: i, replay }
  }
  return undefined
}

export function createLiveCursor(input: {
  sessionId: string
  chatSessionId: string
  parentMessageId: string
  accountHash: string
  model: ModelId
  messages: readonly unknown[]
  systemHash: string
  toolsHash: string
  sessionTitle?: string
}): LiveRemoteCursor {
  return {
    dshSessionId: input.sessionId,
    chatSessionId: input.chatSessionId,
    parentMessageId: input.parentMessageId,
    accountHash: input.accountHash,
    model: input.model,
    sentCount: input.messages.length,
    sentHash: historyPrefixHash(input.messages, input.messages.length),
    systemHash: input.systemHash,
    toolsHash: input.toolsHash,
    ...(input.sessionTitle === undefined ? {} : { sessionTitle: input.sessionTitle }),
  }
}

export function deltaAfterBoundPrefix(messages: readonly unknown[], sentCount: number): unknown[] {
  const rest = messages.slice(sentCount)
  const first = rest[0] as { role?: string; source?: { kind?: string } } | undefined
  if (first?.role === 'assistant' && (first.source?.kind === 'model' || first.source?.kind === undefined)) {
    return rest.slice(1)
  }
  return [...rest]
}

function continueFrom(input: {
  messages: readonly unknown[]
  sessionId?: string
  accountHash: string
  model: ModelId
  systemHash: string
  toolsHash: string
}, cursor: {
  dshSessionId?: string
  accountHash: string
  model: ModelId
  chatSessionId: string
  parentMessageId: string
  prefixCount: number
  prefixHash: string
  systemHash: string
  toolsHash: string
  deltaMessages: unknown[]
}): ConversationPlan {
  if (cursor.accountHash !== input.accountHash) return { kind: 'rebuild', reason: 'account-mismatch' }
  if (cursor.model !== input.model) return { kind: 'rebuild', reason: 'model-mismatch' }
  if ((cursor.dshSessionId ?? '') !== (input.sessionId ?? '')) return { kind: 'rebuild', reason: 'session-fork' }
  if (input.messages.length < cursor.prefixCount) return { kind: 'rebuild', reason: 'history-mismatch' }
  if (historyPrefixHash(input.messages, cursor.prefixCount) !== cursor.prefixHash) {
    return { kind: 'rebuild', reason: 'history-mismatch' }
  }
  const contractUpdate = cursor.toolsHash !== input.toolsHash || cursor.systemHash !== input.systemHash
    ? {
        system: cursor.systemHash === input.systemHash ? undefined : 'updated',
        tools: cursor.toolsHash !== input.toolsHash,
      }
    : undefined
  return {
    kind: 'continue',
    chatSessionId: cursor.chatSessionId,
    parentMessageId: cursor.parentMessageId,
    deltaMessages: cursor.deltaMessages,
    contractUpdate,
  }
}

export function planConversation(input: {
  messages: readonly unknown[]
  sessionId?: string
  accountHash: string
  model: ModelId
  provider: string
  purpose?: 'compaction' | 'session-title'
  systemHash: string
  toolsHash: string
  live?: LiveRemoteCursor
}): ConversationPlan {
  if (input.purpose === 'compaction' || input.purpose === 'session-title') {
    return { kind: 'one-shot', purpose: input.purpose }
  }
  if (input.live && input.sessionId !== undefined && input.live.dshSessionId === input.sessionId) {
    const livePlan = continueFrom(input, {
      dshSessionId: input.live.dshSessionId,
      accountHash: input.live.accountHash,
      model: input.live.model,
      chatSessionId: input.live.chatSessionId,
      parentMessageId: input.live.parentMessageId,
      prefixCount: input.live.sentCount,
      prefixHash: input.live.sentHash,
      systemHash: input.live.systemHash,
      toolsHash: input.live.toolsHash,
      deltaMessages: deltaAfterBoundPrefix(input.messages, input.live.sentCount),
    })
    return livePlan
  }
  const found = lastModelReplay(input.messages, input.provider)
  if (found === undefined) return { kind: 'rebuild', reason: 'no-replay' }
  const replay = found.replay
  return continueFrom(input, {
    dshSessionId: replay.dshSessionId,
    accountHash: replay.affinity.accountHash,
    model: replay.affinity.model,
    chatSessionId: replay.remote.chatSessionId,
    parentMessageId: replay.remote.responseMessageId,
    prefixCount: found.index,
    prefixHash: replay.history.inputPrefixHash,
    systemHash: replay.contract.systemHash,
    toolsHash: replay.contract.toolsHash,
    deltaMessages: [...input.messages.slice(found.index + 1)],
  })
}
