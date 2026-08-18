import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ERROR_CODES } from '../../packages/compat/src/errors.ts'

describe('packaging invariants', () => {
  it('plugin package.json has no workspace protocol and no postinstall compiler', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../packages/plugin/package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>
      scripts?: Record<string, string>
      files?: string[]
      repository?: { url?: string }
    }
    expect(JSON.stringify(pkg.dependencies ?? {})).not.toContain('workspace:')
    expect(pkg.scripts?.postinstall).toBeUndefined()
    expect(pkg.files).toContain('wasm')
    expect(pkg.files).toContain('cordis.patch.yml')
    expect(JSON.stringify(pkg.scripts ?? {})).not.toMatch(/\bcargo\b|wasm-pack/)
    expect(pkg.repository?.url).toContain('y-wi/dsh-deepseek-web')
  })
})

describe('image capability', () => {
  it('declares text-only input and a public unsupported-image code', () => {
    const adapter = readFileSync(new URL('../../packages/plugin/src/adapter.ts', import.meta.url), 'utf8')
    expect(adapter).toContain("inputModalities: ['text']")
    expect(ERROR_CODES.UNSUPPORTED_IMAGE).toBe('DEEPSEEK_WEB_UNSUPPORTED_IMAGE')
  })
})
