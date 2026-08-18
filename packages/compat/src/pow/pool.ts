import { ABSOLUTE_NONCE_LIMIT, POW_DEADLINE_MS } from '../constants.ts'
import { DeepSeekWebError, ERROR_CODES } from '../errors.ts'
import type { PowChallenge } from '../types.ts'
import { loadWasmPowSolver, type WasmPowSolver } from './wasm.ts'

export class PowWorkerPool {
  private disposed = false
  private wasmPromise?: Promise<WasmPowSolver | undefined>

  constructor(_options?: { workerUrl?: URL; maxWorkers?: number; fallback?: boolean }) {
    void this.warmup()
  }

  warmup(): Promise<WasmPowSolver | undefined> {
    this.wasmPromise ??= loadWasmPowSolver()
    return this.wasmPromise
  }

  async solverKind(): Promise<'wasm'> {
    if ((await this.warmup()) === undefined) {
      throw new DeepSeekWebError('PoW WASM unavailable', ERROR_CODES.POW)
    }
    return 'wasm'
  }

  async solve(challenge: PowChallenge, options?: {
    signal?: AbortSignal
    nonceLimit?: number
    deadlineMs?: number
  }): Promise<{ nonce: number; header?: string }> {
    if (this.disposed) throw new DeepSeekWebError('PoW pool disposed', ERROR_CODES.POW)
    if (options?.signal?.aborted) throw new DeepSeekWebError('PoW aborted', ERROR_CODES.POW)
    const nonceLimit = Math.min(options?.nonceLimit ?? ABSOLUTE_NONCE_LIMIT, ABSOLUTE_NONCE_LIMIT)
    const deadlineMs = options?.deadlineMs ?? (Date.now() + POW_DEADLINE_MS)
    const wasm = await this.warmup()
    if (options?.signal?.aborted) throw new DeepSeekWebError('PoW aborted', ERROR_CODES.POW)
    if (wasm === undefined) {
      throw new DeepSeekWebError('PoW WASM unavailable', ERROR_CODES.POW)
    }
    const solved = wasm.solve(challenge, Date.now(), nonceLimit, deadlineMs)
    return { nonce: solved.nonce, header: solved.header }
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }
}
