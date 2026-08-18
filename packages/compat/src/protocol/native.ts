import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface WasmStreamAssembler {
  push(event: string, data: string): void
  take_delta(): string
  finish(): string
}

export interface WasmNative {
  protocol_abi_version(): number
  build_request_json(commandJson: string): string
  parse_response_json(metaJson: string, body: Uint8Array): string
  pathless_sse_fixture(): string
  encode_pow_header_json(challengeJson: string, nonce: bigint, target: string): string
  solve_pow_json(json: string, now: bigint, limit: bigint, deadline: bigint): string
  hash_hex(input: Uint8Array): string
  WasmStreamAssembler: new () => WasmStreamAssembler
}

function candidateDirs(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  return [
    join(here, '..', 'generated'),
    join(here, '..', '..', 'generated'),
    join(here, '..', '..', 'plugin', 'wasm'),
    join(here, '..', '..', '..', 'plugin', 'wasm'),
    join(here, '..', 'wasm'),
    join(here, '..', '..', 'wasm'),
    join(here, '..', '..', '..', 'wasm'),
    join(here, '..', '..', '..', '..', 'packages', 'plugin', 'wasm'),
  ]
}

let cached: Promise<WasmNative | undefined> | undefined

export function wasmCandidateDirs(): string[] {
  return candidateDirs()
}

export async function loadWasmNative(): Promise<WasmNative | undefined> {
  cached ??= (async () => {
    for (const dir of candidateDirs()) {
      try {
        const jsPath = join(dir, 'deepseek_web_core.js')
        const wasmPath = join(dir, 'deepseek_web_core_bg.wasm')
        const bytes = new Uint8Array(await readFile(wasmPath))
        const mod = await import(pathToFileURL(jsPath).href) as WasmNative & {
          default: (input: Uint8Array | { module_or_path: Uint8Array }) => Promise<unknown>
        }
        await mod.default({ module_or_path: bytes })
        if (typeof mod.protocol_abi_version !== 'function') continue
        return mod
      } catch {
        continue
      }
    }
    return undefined
  })()
  return cached
}

export function resetWasmNativeForTests(): void {
  cached = undefined
}
