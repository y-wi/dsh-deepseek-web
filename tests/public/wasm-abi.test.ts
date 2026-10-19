import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { loadProtocolCore, PROTOCOL_ABI_VERSION } from '../../packages/compat/src/protocol/core.ts'
import { readSseResponse } from '../../packages/compat/src/sse.ts'

describe('precompiled protocol core', () => {
  it('rejects in-stream rate limits with their provider code and status', async () => {
    const raw = 'event: ready\ndata: {"request_message_id":1,"response_message_id":2}\n\n'
      + 'event: hint\ndata: {"type":"error","finish_reason":"rate_limit_reached"}\n\n'
      + 'event: close\ndata: {}\n\n'
    await expect(readSseResponse(new Response(raw))).rejects.toMatchObject({ code: 'DEEPSEEK_WEB_RATE_LIMIT', status: 429 })
  })

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
