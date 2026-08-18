import { parentPort } from 'node:worker_threads'
import { loadWasmPowSolver } from './wasm.ts'

type Payload = {
  challenge: {
    algorithm: string
    challenge: string
    salt: string
    signature: string
    expireAt: number
    difficulty: number
  }
  nowMs: number
  nonceLimit: number
  deadlineMs: number
}

const wasmPromise = loadWasmPowSolver()

parentPort?.on('message', async (payload: Payload) => {
  try {
    const wasm = await wasmPromise
    if (wasm === undefined) {
      parentPort?.postMessage({ ok: false, error: 'PoW WASM unavailable' })
      return
    }
    const result = wasm.solve(payload.challenge, payload.nowMs, payload.nonceLimit, payload.deadlineMs)
    parentPort?.postMessage({ ok: true, nonce: result.nonce, header: result.header })
  } catch (error) {
    parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
