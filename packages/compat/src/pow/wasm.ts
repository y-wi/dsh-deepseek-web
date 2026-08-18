import type { PowChallenge } from '../types.ts'
import { loadWasmNative } from '../protocol/native.ts'

export interface WasmPowSolver {
  solve(
    challenge: PowChallenge,
    nowMs: number,
    nonceLimit: number,
    deadlineMs: number,
  ): { nonce: number; header: string }
}

export async function loadWasmPowSolver(): Promise<WasmPowSolver | undefined> {
  const native = await loadWasmNative()
  if (native === undefined) return undefined
  return {
    solve(challenge, nowMs, nonceLimit, deadlineMs) {
      const json = JSON.stringify({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        signature: challenge.signature,
        expire_at: challenge.expireAt,
        difficulty: challenge.difficulty,
      })
      const parsed = JSON.parse(
        native.solve_pow_json(json, BigInt(nowMs), BigInt(nonceLimit), BigInt(deadlineMs)),
      ) as { nonce: number; header: string }
      if (typeof parsed.nonce !== 'number' || typeof parsed.header !== 'string') {
        throw new Error('invalid wasm PoW result')
      }
      return parsed
    },
  }
}
