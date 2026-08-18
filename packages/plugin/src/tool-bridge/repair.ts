export function promisedToolContinuation(content: string): boolean {
  const text = content.trim()
  if (text.length === 0) return false
  const lower = text.toLowerCase()
  const english = ['let me ', "i'll ", 'i will ', "i'm going to "]
  const actions = ['inspect', 'search', 'read', 'check', 'run', 'look at', 'locate', 'verify']
  for (const marker of english) {
    const index = lower.indexOf(marker)
    if (index >= 0 && index < 80 && actions.some(action => lower.includes(action))) return true
  }
  const chineseIntent = ['我先', '我会先', '我将先', '接下来我']
  const chineseAction = ['查找', '搜索', '读取', '查看', '检查', '定位', '运行', '验证']
  return chineseIntent.some(marker => text.includes(marker)) && chineseAction.some(marker => text.includes(marker))
}

export function repairPrompt(reason: string): string {
  return `<DSH_TOOL_PROTOCOL_REPAIR>
The previous reply was not a valid Harness tool protocol: ${reason}
Emit exactly one un-fenced <dsh_tool_calls> block with valid JSON, or answer the user without claiming a local tool ran.
</DSH_TOOL_PROTOCOL_REPAIR>`
}

export function promisedContinuationPrompt(): string {
  return `<DSH_TOOL_PROTOCOL_REPAIR>
You promised a local repository/file/shell operation. Either emit a valid <dsh_tool_calls> block now, or answer without claiming the operation happened.
</DSH_TOOL_PROTOCOL_REPAIR>`
}
