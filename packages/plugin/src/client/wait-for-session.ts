import type { HarnessSessionsLike } from './host-types.ts'

export function sessionIsListed(sessions: HarnessSessionsLike | undefined, sessionId: string): boolean {
  const snapshot = sessions?.list?.getSnapshot?.()
  if (snapshot === undefined) return false
  if (Array.isArray(snapshot.ids) && snapshot.ids.includes(sessionId)) return true
  if (snapshot.byId !== undefined && snapshot.byId[sessionId] !== undefined) return true
  if (Array.isArray(snapshot.items) && snapshot.items.some(row => row.id === sessionId)) return true
  return false
}

export async function waitForListedSession(
  sessions: HarnessSessionsLike | undefined,
  sessionId: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<void> {
  if (sessions === undefined) {
    throw new Error('Harness sessions are unavailable')
  }
  const timeoutMs = options?.timeoutMs ?? 8_000
  const deadline = Date.now() + timeoutMs
  if (options?.signal?.aborted) throw new Error('cancelled')
  const listed = () => sessionIsListed(sessions, sessionId)
  if (listed()) return
  await sessions.refresh?.()
  if (listed()) return

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let poll: ReturnType<typeof setInterval> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: (() => void) | undefined
    const finish = (next: () => void): void => {
      if (settled) return
      settled = true
      if (poll !== undefined) clearInterval(poll)
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe?.()
      options?.signal?.removeEventListener('abort', onAbort)
      next()
    }
    const onAbort = (): void => {
      finish(() => reject(new Error('cancelled')))
    }
    const check = (): void => {
      if (listed()) finish(resolve)
    }
    unsubscribe = sessions.list?.subscribe?.(check)
    options?.signal?.addEventListener('abort', onAbort)
    poll = setInterval(() => {
      if (options?.signal?.aborted) {
        onAbort()
        return
      }
      void Promise.resolve(sessions.refresh?.()).then(check, check)
    }, 50)
    timer = setTimeout(() => {
      finish(() => reject(new Error('the conversation is not yet visible in Harness')))
    }, Math.max(0, deadline - Date.now()))
    check()
  })
}

export async function openHarnessSession(
  sessions: HarnessSessionsLike | undefined,
  sessionId: string,
  options?: { timeoutMs?: number; signal?: AbortSignal; navigate?: (id: string) => void },
): Promise<void> {
  await waitForListedSession(sessions, sessionId, options)
  if (options?.signal?.aborted) throw new Error('cancelled')
  if (options?.navigate !== undefined) options.navigate(sessionId)
  else {
    // Older embedders can still supply their own navigation on the controller.
    const legacy = sessions as HarnessSessionsLike & { open?: (id: string) => void }
    if (typeof legacy.open !== 'function') throw new Error('Harness navigation is unavailable')
    legacy.open(sessionId)
  }
}
