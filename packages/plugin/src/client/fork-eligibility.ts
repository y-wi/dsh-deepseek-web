import { PROVIDER_ID } from './slot-ids.ts'

export interface ConversationNodeLike {
  kind?: string
  messageId?: string
  interrupted?: boolean
  provenance?: { provider?: string; model?: string }
  data?: ConversationNodeLike & {
    finalNode?: ConversationNodeLike
    closing?: ConversationNodeLike & { finalNode?: ConversationNodeLike }
  }
}

export interface ConversationSnapshotLike {
  nodes?: readonly ConversationNodeLike[]
  chat?: {
    nodes?: { values?: () => Iterable<ConversationNodeLike> | readonly ConversationNodeLike[] }
    legacy?: { nodes?: readonly ConversationNodeLike[] }
  }
}

function asNodeList(value: unknown): ConversationNodeLike[] | undefined {
  if (Array.isArray(value)) return value as ConversationNodeLike[]
  if (value !== undefined && value !== null && typeof value === 'object' && Symbol.iterator in value) {
    return [...(value as Iterable<ConversationNodeLike>)]
  }
  return undefined
}

function flattenNode(node: ConversationNodeLike | undefined, into: ConversationNodeLike[]): void {
  if (node === undefined) return
  into.push(node)
  if (node.data === undefined) return
  into.push(node.data)
  flattenNode(node.data.finalNode, into)
  if (node.data.closing !== undefined) {
    into.push(node.data.closing)
    flattenNode(node.data.closing.finalNode, into)
  }
}

export function conversationNodes(snapshot: ConversationSnapshotLike | undefined): readonly ConversationNodeLike[] {
  if (snapshot === undefined) return []
  const found: ConversationNodeLike[] = []
  const sources = [
    snapshot.nodes,
    snapshot.chat?.legacy?.nodes,
    asNodeList(snapshot.chat?.nodes?.values?.()),
  ]
  for (const source of sources) {
    const nodes = asNodeList(source)
    if (nodes === undefined) continue
    for (const node of nodes) flattenNode(node, found)
  }
  return found
}

function nodeMessageId(node: ConversationNodeLike): string | undefined {
  return node.messageId ?? node.data?.messageId
}

function nodeProvenance(node: ConversationNodeLike): { provider?: string; model?: string } | undefined {
  return node.provenance ?? node.data?.provenance
}

function nodeInterrupted(node: ConversationNodeLike): boolean {
  return node.interrupted === true || node.data?.interrupted === true
}

function isAssistant(node: ConversationNodeLike): boolean {
  return node.kind === 'assistant' || node.data?.kind === 'assistant'
}

/**
 * Hide only when the snapshot positively identifies a non-DeepSeek or
 * interrupted assistant. Chat view nodes omit `provenance.provider`, so a
 * missing provider still shows the action; Host rejects other providers.
 */
export function isDeepSeekWebAssistantMessage(
  snapshot: ConversationSnapshotLike | undefined,
  messageId: string,
): boolean {
  let matched = false
  for (const node of conversationNodes(snapshot)) {
    if (!isAssistant(node)) continue
    if (nodeMessageId(node) !== messageId) continue
    matched = true
    if (nodeInterrupted(node)) return false
    const provider = nodeProvenance(node)?.provider
    if (provider !== undefined && provider !== PROVIDER_ID) return false
    return true
  }
  return !matched
}
