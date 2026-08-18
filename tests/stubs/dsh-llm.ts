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
