import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ERROR_CODES } from '../../packages/compat/src/errors.ts'

describe('packaging invariants', () => {
  it('plugin package.json has no workspace protocol and no postinstall compiler', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../packages/plugin/package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
      scripts?: Record<string, string>
      files?: string[]
      repository?: { url?: string }
      dsh?: {
        plugin?: boolean
        kind?: string
        client?: { inject?: string[] }
        bundle?: { patch?: string }
      }
      disclosure?: { cloud?: boolean; offlineMode?: boolean; network?: string[] }
      engines?: { node?: string }
    }
    expect(JSON.stringify(pkg.dependencies ?? {})).not.toContain('workspace:')
    expect(pkg.scripts?.postinstall).toBeUndefined()
    expect(pkg.files).toContain('wasm')
    expect(pkg.files).toContain('cordis.patch.yml')
    expect(JSON.stringify(pkg.scripts ?? {})).not.toMatch(/\bcargo\b|wasm-pack/)
    expect(pkg.repository?.url).toContain('y-wi/dsh-deepseek-web')
    const hostPeers = [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-commands',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-home-paths',
      '@deepseek-ai/dsh-host-webserver',
      '@deepseek-ai/dsh-invariants',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/schemastery',
      'react',
    ]
    for (const name of hostPeers) {
      expect(pkg.dependencies?.[name]).toBeUndefined()
      expect(pkg.peerDependencies?.[name]).toBeDefined()
      expect(pkg.peerDependenciesMeta?.[name]?.optional).toBe(true)
    }
    for (const name of pkg.dsh?.client?.inject ?? []) {
      expect(pkg.peerDependencies?.[name]).toBeUndefined()
    }
    expect(pkg.dsh?.plugin).toBe(true)
    expect(pkg.dsh?.kind).toBe('server')
    expect(pkg.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-ui-sidebar')
    expect(pkg.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(pkg.disclosure?.cloud).toBe(true)
    expect(pkg.disclosure?.offlineMode).toBe(false)
    expect(pkg.disclosure?.network).toContain('https://chat.deepseek.com')
  })
})

describe('image capability', () => {
  it('declares text-only input and a public unsupported-image code', () => {
    const adapter = readFileSync(new URL('../../packages/plugin/src/adapter.ts', import.meta.url), 'utf8')
    expect(adapter).toContain("inputModalities: ['text']")
    expect(ERROR_CODES.UNSUPPORTED_IMAGE).toBe('DEEPSEEK_WEB_UNSUPPORTED_IMAGE')
  })
})
