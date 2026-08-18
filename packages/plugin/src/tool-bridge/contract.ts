import { canonicalJson, type BridgeToolSchema } from './parser.ts'

export function toolsHash(tools: readonly BridgeToolSchema[]): string {
  return canonicalJson(tools)
}

export function buildToolContract(tools: readonly BridgeToolSchema[], maxCalls: number): string {
  if (tools.length === 0) return ''
  return `
<DSH_LOCAL_TOOL_CONTRACT version="1">
DeepSeek Web does not expose native function calling.
The following capabilities are provided by DeepSeek Harness.
When a local operation is required, output exactly one un-fenced block as the first non-whitespace content and stop:
<dsh_tool_calls>
{
  "version": 1,
  "calls": [
    {
      "name": "shell",
      "arguments": {
        "command": "rg --files"
      }
    }
  ]
}
</dsh_tool_calls>
Rules:
- no text before the block
- no text after the block
- use only listed tools
- arguments must be a JSON object
- max ${maxCalls} calls
- never claim execution before Harness returns results
- do not emit <ds_local_tool_calls>, <invoke>, or DSML; those are parsed only as a compatibility fallback
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
