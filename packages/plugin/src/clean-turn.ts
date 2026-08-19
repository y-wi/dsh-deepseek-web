const enabled = new Set<string>()

export function isCleanMode(sessionId: string | undefined): boolean {
  return sessionId !== undefined && enabled.has(sessionId)
}

export function setCleanMode(sessionId: string, on: boolean): void {
  if (on) enabled.add(sessionId)
  else enabled.delete(sessionId)
}
