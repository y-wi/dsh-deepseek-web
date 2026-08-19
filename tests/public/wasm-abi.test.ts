import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { loadProtocolCore, PROTOCOL_ABI_VERSION } from '../../packages/compat/src/protocol/core.ts'

describe('precompiled protocol core', () => {
  it('loads matching ABI and matches the manifest hash file', async () => {
    const core = await loadProtocolCore()
    expect(core.abiVersion).toBe(PROTOCOL_ABI_VERSION)
    const manifestPath = new URL('../../packages/plugin/wasm/protocol-core-manifest.json', import.meta.url)
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      abiVersion: number
      sha256: string
      coreVersion?: string
      buildProfile?: string
    }
    expect(manifest.abiVersion).toBe(PROTOCOL_ABI_VERSION)
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.privateCommit).toBeUndefined()
  })
})
