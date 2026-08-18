import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

export async function loadCoreWasm(wasmPath?: string): Promise<Buffer | undefined> {
  try {
    const path = wasmPath ?? fileURLToPath(new URL('../generated/deepseek_web_core_bg.wasm', import.meta.url))
    const bytes = await readFile(path)
    return bytes
  } catch {
    return undefined
  }
}
