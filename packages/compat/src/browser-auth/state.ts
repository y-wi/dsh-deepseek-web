import type { BrowserAuthState } from '../types.ts'

export function signedOut(): BrowserAuthState {
  return { status: 'signed-out' }
}
