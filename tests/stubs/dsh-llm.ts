export class LlmAdapter {}

export class LlmError extends Error {
  code: string
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
    this.name = 'LlmError'
  }
}

export function ReasoningEffortId(id: string): string {
  return id
}

export function createUserMessage<T extends { content: unknown; source: unknown }>(
  input: T,
): T & { id: string; role: 'user' } {
  return {
    ...input,
    id: crypto.randomUUID(),
    role: 'user',
  }
}

export function createAssistantMessage(input: {
  content: unknown
  source: { provider: string; model: string; replayState?: unknown }
}): {
  id: string
  role: 'assistant'
  content: unknown
  source: { kind: 'model'; provider: string; model: string; replayState?: unknown }
} {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: input.content,
    source: { kind: 'model', ...input.source },
  }
}
