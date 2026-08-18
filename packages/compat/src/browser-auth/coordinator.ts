import { join } from 'node:path'
import { DeepSeekWebError, ERROR_CODES } from '../errors.ts'
import type { BrowserAuthState, BrowserKind, PublicAccountInfo } from '../types.ts'
import { CompatDeepSeekWebClient } from '../client.ts'
import { HeaderCorrelator, isTargetApiRequest, extractBearer, DEEPSEEK_WEB_ORIGIN } from './capture.ts'
import { attachPage, CdpSession } from './cdp.ts'
import { discoverBrowsers, preferCandidate } from './discovery.ts'
import { installManagedBrowser } from './installer.ts'
import { launchIsolatedBrowser, stopBrowser, type LaunchedBrowser } from './process.ts'
import { ensureIsolatedProfile, resetIsolatedProfile } from './profile.ts'
import { signedOut } from './state.ts'

export interface BrowserLoginOptions {
  preferred?: 'auto' | BrowserKind
  allowManagedDownload?: boolean
  resetProfile?: boolean
  signal?: AbortSignal
}

export interface BrowserAuthDependencies {
  resolveHome: () => string
  validateCredential: (token: string, signal?: AbortSignal) => Promise<PublicAccountInfo>
  storeCredential: (token: string) => Promise<void>
  clearCredential: () => Promise<void>
  readStoredAccount?: () => Promise<PublicAccountInfo | undefined>
}

export class BrowserAuthCoordinator {
  private state: BrowserAuthState = signedOut()
  private operation: Promise<BrowserAuthState> | undefined
  private launched?: LaunchedBrowser
  private cdp?: CdpSession
  private cancellation?: AbortController
  private explicitSignOut = false

  constructor(private readonly deps: BrowserAuthDependencies) {}

  async status(): Promise<BrowserAuthState> {
    if (this.operation !== undefined) return this.state
    if (this.state.status === 'signed-in' || this.state.status === 'error') return this.state
    if (this.explicitSignOut) return this.state
    const stored = await this.deps.readStoredAccount?.()
    if (stored) {
      this.state = { status: 'signed-in', account: stored, browser: { kind: 'unknown' } }
    }
    return this.state
  }

  signIn(options?: BrowserLoginOptions): Promise<BrowserAuthState> {
    if (this.operation !== undefined) return this.operation
    this.explicitSignOut = false
    this.state = { status: 'detecting-browser' }
    this.cancellation = new AbortController()
    const signal = options?.signal
    const onAbort = () => this.cancellation?.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    this.operation = this.run(options).finally(() => {
      this.operation = undefined
      this.cancellation = undefined
      signal?.removeEventListener('abort', onAbort)
    })
    return this.operation
  }

  async cancel(): Promise<void> {
    this.cancellation?.abort()
    await this.operation?.catch(() => undefined)
    await this.cleanup()
    if (this.state.status !== 'signed-in') {
      this.state = { status: 'error', code: ERROR_CODES.BROWSER_LOGIN_CANCELLED, message: 'login cancelled' }
    }
  }

  async signOut(options?: { clearProfile?: boolean }): Promise<void> {
    this.explicitSignOut = true
    await this.cancel()
    try {
      await this.deps.clearCredential()
    } catch {
      /* still wipe the isolated profile so the next login cannot reuse cookies */
    }
    if (options?.clearProfile !== false) {
      await resetIsolatedProfile(this.profileDir())
    }
    this.state = signedOut()
  }

  async dispose(): Promise<void> {
    await this.cancel()
  }

  private profileDir(): string {
    return join(this.deps.resolveHome(), 'browser-profiles', 'dsh-deepseek-web')
  }

  private cacheDir(): string {
    return join(this.deps.resolveHome(), 'cache', 'dsh-deepseek-web', 'browser')
  }

  private async run(options?: BrowserLoginOptions): Promise<BrowserAuthState> {
    try {
      if (options?.resetProfile) {
        try {
          await this.deps.clearCredential()
        } catch {
          /* continue with a clean browser profile even if the store rejects unset */
        }
        await resetIsolatedProfile(this.profileDir())
      }
      this.state = { status: 'detecting-browser' }
      let candidates = await discoverBrowsers()
      let selected = preferCandidate(candidates, options?.preferred ?? 'auto')
      if ((selected === undefined || options?.preferred === 'managed') && (options?.allowManagedDownload ?? true)) {
        this.state = { status: 'installing-browser' }
        selected = await installManagedBrowser({
          cacheDir: this.cacheDir(),
          allowDownload: options?.allowManagedDownload ?? true,
          onProgress: progress => {
            this.state = { status: 'installing-browser', progress }
          },
        })
      }
      if (selected === undefined) {
        throw new DeepSeekWebError('no compatible browser found', ERROR_CODES.BROWSER_NOT_FOUND)
      }
      this.state = { status: 'launching-browser' }
      const userDataDir = await ensureIsolatedProfile(this.profileDir())
      this.launched = await launchIsolatedBrowser({ executable: selected.executable, userDataDir })
      this.cdp = await CdpSession.connect(this.launched.browserWS)
      const page = await attachPage(this.cdp)
      const correlator = new HeaderCorrelator()
      let captured: string | undefined
      const capture = (method: string, params: Record<string, unknown>) => {
        if (method !== 'Network.requestWillBeSent' && method !== 'Network.requestWillBeSentExtraInfo') return
        const request = params.request as { url?: string; headers?: Record<string, string> } | undefined
        const url = request?.url ?? (params.headers !== undefined ? undefined : undefined)
        const requestId = String(params.requestId ?? '')
        const headers = (request?.headers ?? params.headers) as Record<string, string> | undefined
        if (url !== undefined && !isTargetApiRequest(url) && method === 'Network.requestWillBeSent') return
        const bearer = correlator.consider(requestId, url ?? `${DEEPSEEK_WEB_ORIGIN}/api/v0/`, headers)
        if (bearer) captured = bearer
        const extra = extractBearer(params.headers as Record<string, string> | undefined)
        if (extra && (url === undefined || isTargetApiRequest(url))) captured = extra
      }
      this.cdp.onEvent(capture)
      await page.session.send('Network.enable', {}, page.sessionId)
      await page.session.send('Page.enable', {}, page.sessionId)
      this.state = { status: 'waiting-for-login' }
      await page.session.send('Page.navigate', { url: DEEPSEEK_WEB_ORIGIN }, page.sessionId)
      const deadline = Date.now() + 15 * 60_000
      while (Date.now() < deadline) {
        if (this.cancellation?.signal.aborted) {
          throw new DeepSeekWebError('login cancelled', ERROR_CODES.BROWSER_LOGIN_CANCELLED)
        }
        if (captured) {
          this.state = { status: 'validating' }
          try {
            const account = await this.deps.validateCredential(captured, this.cancellation?.signal)
            await this.deps.storeCredential(captured)
            captured = undefined
            this.state = {
              status: 'signed-in',
              account,
              browser: { kind: selected.kind, version: selected.version },
            }
            await this.cleanup()
            return this.state
          } catch {
            captured = undefined
            this.state = { status: 'waiting-for-login' }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      throw new DeepSeekWebError('login timed out', ERROR_CODES.BROWSER_LOGIN_CANCELLED)
    } catch (error) {
      await this.cleanup()
      const code = error instanceof DeepSeekWebError ? error.code : ERROR_CODES.BROWSER_LAUNCH
      const message = error instanceof Error ? error.message : String(error)
      this.state = { status: 'error', code, message }
      return this.state
    }
  }

  private async cleanup(): Promise<void> {
    this.cdp?.close()
    this.cdp = undefined
    await stopBrowser(this.launched)
    this.launched = undefined
  }
}

export async function validateWithClient(token: string, signal?: AbortSignal): Promise<PublicAccountInfo> {
  const client = new CompatDeepSeekWebClient()
  try {
    const account = await client.currentUser(token, signal)
    return { accountHash: account.accountHash }
  } finally {
    await client.dispose()
  }
}
