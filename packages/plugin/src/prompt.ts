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

export function buildFullPrompt(input: {
  system?: string
  messages: PromptMessage[]
  tools: readonly BridgeToolSchema[]
  nativeSearch: boolean
  maxCalls: number
  attachedImageCount?: number
}): string {
  const search = input.nativeSearch
    ? 'DeepSeek request-level web search is enabled for this turn. It is a provider mode, not a callable tool.'
    : 'DeepSeek request-level web search is disabled for this turn.'
  const images = (input.attachedImageCount ?? 0) > 0
    ? `This turn includes ${input.attachedImageCount} DeepSeek file attachment(s) via ref_file_ids. Treat them as visual input.`
    : ''
  const conversation = input.messages.map(message => formatMessage(message)).join('\n\n')
  return `<DEEPSEEK_WEB_AGENT_BOUNDARY>
This conversation runs through DeepSeek Web. The upstream model exposes no native function-calling tools. Never claim that DeepSeek itself called a tool. Any listed tools are DeepSeek Harness capabilities mediated exclusively by DSH_LOCAL_TOOL_CONTRACT. ${search} ${images}
</DEEPSEEK_WEB_AGENT_BOUNDARY>

<DSH_AGENT_INSTRUCTIONS>
${input.system ?? ''}
</DSH_AGENT_INSTRUCTIONS>

<DSH_CONVERSATION>
${conversation}
</DSH_CONVERSATION>
${buildToolContract(input.tools, input.maxCalls)}

Return the next response for the latest user task. If local action is needed, emit one valid <dsh_tool_calls> block and stop; otherwise answer normally.`
}

export function buildIncrementalPrompt(input: {
  systemUpdate?: string
  toolsUpdate?: readonly BridgeToolSchema[]
  delta: PromptMessage[]
  nativeSearch: boolean
  attachedImageCount?: number
}): string {
  const search = input.nativeSearch
    ? 'Native search remains enabled.'
    : 'Native search remains disabled.'
  const images = (input.attachedImageCount ?? 0) > 0
    ? `This turn includes ${input.attachedImageCount} DeepSeek file attachment(s) via ref_file_ids.`
    : ''
  const parts = [
    '<DEEPSEEK_WEB_INCREMENTAL_CONTEXT>',
    search,
    images,
    input.systemUpdate ? buildSystemUpdate(input.systemUpdate) : '',
    input.toolsUpdate ? buildContractUpdate(input.toolsUpdate) : '',
    input.delta.map(formatMessage).join('\n\n'),
    '</DEEPSEEK_WEB_INCREMENTAL_CONTEXT>',
    'Continue the existing request. If another local operation is required, emit a new tool-call block. Otherwise answer normally.',
  ]
  return parts.filter(Boolean).join('\n')
}

function formatMessage(message: PromptMessage): string {
  if (message.toolResults && message.toolResults.length > 0) {
    return buildExchange(message.toolCalls ?? [], message.toolResults)
  }
  if (message.role === 'assistant') return `ASSISTANT:\n${message.text}`
  if (message.role === 'system') return `SYSTEM:\n${message.text}`
  return `USER:\n${message.text || '[image attached]'}`
}
