import { canonicalJson, type BridgeToolSchema } from './parser.ts'

export function toolsHash(tools: readonly BridgeToolSchema[]): string {
  return canonicalJson(tools)
}

export function buildToolContract(tools: readonly BridgeToolSchema[], maxCalls: number): string {
  if (tools.length === 0) return ''
  return `
<DSH_LOCAL_TOOL_CONTRACT version="1">
DeepSeek Web does not expose native function calling.
Harness tools are requested only on the answer channel.

CHANNELS:
- thinking / DeepThink: natural-language planning only. Never emit tool tags, JSON call objects, executable command payloads, or a draft of the answer-channel block.
- answer: if a local operation is required, emit exactly one un-fenced block and stop. Otherwise answer the user.

Answer-channel schema (never copy this into thinking):
<dsh_tool_calls>{"version":1,"calls":[{"name":"TOOL_NAME","arguments":{}}]}</dsh_tool_calls>
Rules:
- tool tags belong only in the answer channel
- when calling tools, no user-visible text before or after the block
- use only listed tools
- arguments must be a JSON object
- max ${maxCalls} calls
- never claim execution before Harness returns results
- do not emit <ds_local_tool_calls>, <invoke>, or DSML; those are parsed only as a compatibility fallback
- the runtime strips tool tags from thinking so they never appear in the Think UI
Available tools:
${JSON.stringify(tools)}
</DSH_LOCAL_TOOL_CONTRACT>`
}

export function buildContractUpdate(tools: readonly BridgeToolSchema[]): string {
  return `<DSH_TOOL_CONTRACT_UPDATE>\n${JSON.stringify(tools)}\n</DSH_TOOL_CONTRACT_UPDATE>`
}

export function buildSystemUpdate(system: string): string {
  return `<DSH_SYSTEM_UPDATE>\n${system}\n</DSH_SYSTEM_UPDATE>`
}
