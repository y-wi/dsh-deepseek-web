export function promisedToolContinuation(content: string, nativeSearch = false): boolean {
  const text = content.trim()
  if (text.length === 0) return false
  const lower = text.toLowerCase()
  const english = ['let me ', "i'll ", 'i will ', "i'm going to "]
  const actions = nativeSearch
    ? ['inspect', 'read', 'check', 'run', 'look at', 'locate', 'verify']
    : ['inspect', 'search', 'read', 'check', 'run', 'look at', 'locate', 'verify']
  for (const marker of english) {
    const index = lower.indexOf(marker)
    if (index >= 0 && index < 80 && actions.some(action => lower.includes(action))) return true
  }
  const chineseIntent = ['我先', '我会先', '我将先', '接下来我']
  const chineseAction = nativeSearch
    ? ['读取', '查看', '检查', '定位', '运行', '验证']
    : ['查找', '搜索', '读取', '查看', '检查', '定位', '运行', '验证']
  return chineseIntent.some(marker => text.includes(marker)) && chineseAction.some(action => text.includes(action))
}

export function repairPrompt(reason: string, nativeSearch = false): string {
  const superseded = nativeSearch && /\bweb_search\b|\bweb_fetch\b/.test(reason)
  const extra = superseded
    ? ' web_search and web_fetch are not used on DeepSeek Web. Native search already runs on this turn; answer the user.'
    : nativeSearch
      ? ' Do not call web_search or web_fetch.'
      : ''
  return `<DSH_TOOL_PROTOCOL_REPAIR>
The previous reply was not a valid Harness tool protocol: ${reason}${extra}
Emit exactly one un-fenced <dsh_tool_calls> block with valid JSON in the answer channel (not in thinking), or answer the user without claiming a local tool ran.
</DSH_TOOL_PROTOCOL_REPAIR>`
}

export function promisedContinuationPrompt(nativeSearch = false): string {
  const extra = nativeSearch
    ? ' Looking up current public information is DeepSeek Web Search, not a Harness tool.'
    : ''
  return `<DSH_TOOL_PROTOCOL_REPAIR>
You promised a local repository/file/shell operation.${extra} Either emit a valid <dsh_tool_calls> block in the answer channel now, or answer without claiming the operation happened. Do not put the block in thinking.
</DSH_TOOL_PROTOCOL_REPAIR>`
}
