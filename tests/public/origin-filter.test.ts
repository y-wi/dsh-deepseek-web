import { describe, expect, it } from 'vitest'
import { extractBearer, isTargetApiRequest } from '../../packages/compat/src/browser-auth/capture.ts'
import { trustedPluginRequest, pluginResponseHeaders } from '../../packages/compat/src/browser-auth/security.ts'
import { IncomingMessage } from 'node:http'

describe('browser origin filter', () => {
  it('accepts only https chat.deepseek.com API paths', () => {
    expect(isTargetApiRequest('https://chat.deepseek.com/api/v0/example')).toBe(true)
    expect(isTargetApiRequest('http://chat.deepseek.com/api/v0/example')).toBe(false)
    expect(isTargetApiRequest('https://evil.example/api/v0/example')).toBe(false)
    expect(isTargetApiRequest('https://chat.deepseek.com/')).toBe(false)
    expect(extractBearer({ Authorization: 'Bearer TEST_ONLY_TOKEN' })).toBe('TEST_ONLY_TOKEN')
  })

  it('allows loopback plugin routes and denies remote hosts', () => {
    const loopback = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3000' } } as unknown as IncomingMessage
    expect(trustedPluginRequest(loopback)).toBe(true)
    const remote = { socket: { remoteAddress: '8.8.8.8' }, headers: { host: '127.0.0.1:3000' } } as unknown as IncomingMessage
    expect(trustedPluginRequest(remote)).toBe(false)
    expect(pluginResponseHeaders()['cache-control']).toBe('no-store')
  })
})
