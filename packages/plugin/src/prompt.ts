import { buildContractUpdate, buildSystemUpdate, buildToolContract, type BridgeToolSchema } from './tool-bridge/index.ts'
import { buildExchange, type ToolResultProjection } from './tool-bridge/result.ts'
import type { BridgeToolCall } from './tool-bridge/parser.ts'

export interface PromptMessage {
  role: string
  sourceKind?: string
  text: string
  toolCalls?: BridgeToolCall[]
  toolResults?: ToolResultProjection[]
}

/** DSH agent-preset tools that the official Web Search toggle already covers. */
export const NATIVE_SEARCH_SUPERSEDED_TOOLS = new Set(['web_search', 'web_fetch'])

export function filterToolsForNativeSearch<T extends { name: string }>(
  tools: readonly T[],
  nativeSearch: boolean,
): T[] {
  if (!nativeSearch) return [...tools]
  return tools.filter(tool => !NATIVE_SEARCH_SUPERSEDED_TOOLS.has(tool.name))
}

function nativeSearchOverride(): string {
  return `<DEEPSEEK_WEB_SEARCH>
DeepSeek Web Search is already enabled for this same turn (the official Web Search toggle). It runs automatically while you think and answer. It is not a callable tool and does not require a new conversation.
The agent preset may say to use web_search or web_fetch. Ignore those instructions here. Do not emit web_search, web_fetch, or any invented search tool. For current public information, answer normally; sources appear on the timeline.
Harness file, shell, and similar tools still use DSH_LOCAL_TOOL_CONTRACT when a local operation is required.
</DEEPSEEK_WEB_SEARCH>`
}

function providerBoundary(nativeSearch: boolean, images: string): string {
  const search = nativeSearch
    ? 'DeepSeek Web Search already runs automatically on this turn. It is not a Harness tool.'
    : 'The upstream model exposes no native function-calling API.'
  return `<DEEPSEEK_WEB_AGENT_BOUNDARY>
This conversation runs through DeepSeek Web. ${search} Never claim that DeepSeek itself called a Harness tool. Any listed tools are DeepSeek Harness capabilities mediated exclusively by DSH_LOCAL_TOOL_CONTRACT. ${images}
</DEEPSEEK_WEB_AGENT_BOUNDARY>`
}

export function buildFullPrompt(input: {
  system?: string
  messages: PromptMessage[]
  tools: readonly BridgeToolSchema[]
  maxCalls: number
  attachedImageCount?: number
  nativeSearch?: boolean
}): string {
  const nativeSearch = input.nativeSearch === true
  const images = (input.attachedImageCount ?? 0) > 0
    ? `This turn includes ${input.attachedImageCount} DeepSeek file attachment(s) via ref_file_ids. Treat them as visual input.`
    : ''
  const conversation = input.messages.map(message => formatMessage(message)).join('\n\n')
  const tools = filterToolsForNativeSearch(input.tools, nativeSearch)
  const search = nativeSearch ? `\n${nativeSearchOverride()}\n` : '\n'
  return `${providerBoundary(nativeSearch, images)}

<DSH_AGENT_INSTRUCTIONS>
${input.system ?? ''}
</DSH_AGENT_INSTRUCTIONS>
${search}
<DSH_CONVERSATION>
${conversation}
</DSH_CONVERSATION>
${buildToolContract(tools, input.maxCalls)}

Keep thinking free of tool tags. Return the next answer-channel response for the latest user task. If a local Harness operation is needed, emit one valid <dsh_tool_calls> block in the answer channel and stop; otherwise answer normally.`
}

export function buildIncrementalPrompt(input: {
  systemUpdate?: string
  toolsUpdate?: readonly BridgeToolSchema[]
  delta: PromptMessage[]
  attachedImageCount?: number
  nativeSearch?: boolean
}): string {
  const nativeSearch = input.nativeSearch === true
  const images = (input.attachedImageCount ?? 0) > 0
    ? `This turn includes ${input.attachedImageCount} DeepSeek file attachment(s) via ref_file_ids.`
    : ''
  const toolsUpdate = input.toolsUpdate === undefined
    ? undefined
    : filterToolsForNativeSearch(input.toolsUpdate, nativeSearch)
  const parts = [
    '<DEEPSEEK_WEB_INCREMENTAL_CONTEXT>',
    images,
    nativeSearch ? nativeSearchOverride() : '',
    input.systemUpdate ? buildSystemUpdate(input.systemUpdate) : '',
    toolsUpdate ? buildContractUpdate(toolsUpdate) : '',
    input.delta.map(formatMessage).join('\n\n'),
    '</DEEPSEEK_WEB_INCREMENTAL_CONTEXT>',
    nativeSearch
      ? 'Continue the existing request. Keep thinking free of tool tags. Do not call web_search or web_fetch. If another local Harness operation is required, emit a new tool-call block in the answer channel. Otherwise answer normally.'
      : 'Continue the existing request. Keep thinking free of tool tags. If another local operation is required, emit a new tool-call block in the answer channel. Otherwise answer normally.',
  ]
  return parts.filter(Boolean).join('\n')
}

function wrapTag(tag: string, body: string): string {
  return `<${tag}>\n${body}\n</${tag}>`
}

function formatMessage(message: PromptMessage): string {
  if (message.toolResults && message.toolResults.length > 0) {
    return buildExchange(message.toolCalls ?? [], message.toolResults)
  }
  if (message.role === 'assistant') return wrapTag('assistant', message.text)
  if (message.role === 'system' || message.sourceKind === 'plugin') {
    return wrapTag('dsh_context', message.text)
  }
  const userText = stripHarnessInjections(message.text)
  if (userText.length > 0) return wrapTag('user', userText)
  if ((message.text || '').trim().length === 0) return wrapTag('user', '[image attached]')
  return wrapTag('dsh_context', message.text)
}

const PLUGIN_PROMPT_MARKERS = [
  '<DEEPSEEK_WEB_INCREMENTAL_CONTEXT>',
  '<DEEPSEEK_WEB_AGENT_BOUNDARY>',
  '<DSH_CONVERSATION>',
  '<DSH_AGENT_INSTRUCTIONS>',
  '<DSH_LOCAL_TOOL_EXCHANGE',
  '<DSH_TOOL_PROTOCOL_REPAIR>',
  '<DSH_SYSTEM_UPDATE>',
  '<DSH_TOOL_CONTRACT_UPDATE>',
  '<DSH_LOCAL_TOOL_CONTRACT',
  '<user>',
] as const

const USER_HEAD = 'USER:\n'
const USER_INLINE = '\nUSER:\n'

const INJECTION_STARTS = [
  'Current runtime context.',
  'Current runtime context:',
  'Current DSH file policy:',
  'Approval policy:',
  '<system-reminder>',
  '<available_skills>',
] as const

function innerBetween(text: string, open: string, close: string): string | undefined {
  const start = text.indexOf(open)
  if (start < 0) return undefined
  const from = start + open.length
  const end = text.indexOf(close, from)
  return end < 0 ? text.slice(from) : text.slice(from, end)
}

function taggedPayloads(text: string, tag: string): string[] {
  const open = `<${tag}>`
  const close = `</${tag}>`
  const payloads: string[] = []
  let from = 0
  while (from <= text.length) {
    const start = text.indexOf(open, from)
    if (start < 0) break
    const inner = start + open.length
    const end = text.indexOf(close, inner)
    const body = (end < 0 ? text.slice(inner) : text.slice(inner, end)).trim()
    if (body.length > 0) payloads.push(body)
    from = end < 0 ? text.length + 1 : end + close.length
  }
  return payloads
}

function injectionCut(text: string): number {
  let cut = -1
  const consider = (at: number): void => {
    if (at < 0) return
    if (cut < 0 || at < cut) cut = at
  }
  for (const marker of INJECTION_STARTS) {
    if (text.startsWith(marker)) return 0
    consider(text.indexOf(`\n${marker}`))
  }
  return cut
}

/** Drop DSH runtime-context / skill catalog suffixes that ride on user-role turns. */
export function stripHarnessInjections(text: string): string {
  const cut = injectionCut(text)
  if (cut === 0) return ''
  if (cut < 0) return text.trim()
  return text.slice(0, cut).trim()
}

function payloadEnd(after: string): number {
  const nextRole = after.search(/\n(?:USER|ASSISTANT|SYSTEM):\n/)
  const closeIncremental = after.indexOf('</DEEPSEEK_WEB_INCREMENTAL_CONTEXT>')
  const closeConversation = after.indexOf('</DSH_CONVERSATION>')
  let end = after.length
  if (nextRole >= 0) end = Math.min(end, nextRole)
  if (closeIncremental >= 0) end = Math.min(end, closeIncremental)
  if (closeConversation >= 0) end = Math.min(end, closeConversation)
  return end
}

function userPayloads(body: string): string[] {
  const payloads: string[] = []
  let from = 0
  while (from <= body.length) {
    let at: number
    if (from === 0 && body.startsWith(USER_HEAD)) at = 0
    else {
      at = body.indexOf(USER_INLINE, from)
      if (at < 0) break
    }
    const start = at === 0 && body.startsWith(USER_HEAD) ? USER_HEAD.length : at + USER_INLINE.length
    const after = body.slice(start)
    const relEnd = payloadEnd(after)
    const payload = after.slice(0, relEnd).trim()
    if (payload.length > 0) payloads.push(payload)
    from = start + Math.max(relEnd, 1)
  }
  return payloads
}

function looksLikePluginPrompt(text: string): boolean {
  return PLUGIN_PROMPT_MARKERS.some(marker => text.includes(marker))
}

function cleanUserPayloads(payloads: readonly string[]): string {
  return payloads.map(stripHarnessInjections).filter(payload => payload.length > 0).join('\n\n')
}

/**
 * Remote Web history stores the plugin's prompt envelope as the user turn.
 * Import keeps only `<user>` payloads (with a `USER:` fallback) and drops
 * contracts, plugin context, search overrides, and trailing channel instructions.
 */
export function extractImportedUserText(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n')
  const tagged = cleanUserPayloads(taggedPayloads(normalized, 'user'))
  if (tagged.length > 0) return tagged
  if (!looksLikePluginPrompt(normalized)) return stripHarnessInjections(normalized)
  const body = innerBetween(normalized, '<DSH_CONVERSATION>', '</DSH_CONVERSATION>')
    ?? innerBetween(normalized, '<DEEPSEEK_WEB_INCREMENTAL_CONTEXT>', '</DEEPSEEK_WEB_INCREMENTAL_CONTEXT>')
    ?? normalized
  return cleanUserPayloads(userPayloads(body))
}
