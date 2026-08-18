import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BrowserCandidate, BrowserKind } from '../types.ts'

const exec = promisify(execFile)

function pushIfExists(out: BrowserCandidate[], id: string, kind: BrowserKind, executable: string): void {
  if (executable.length > 0 && existsSync(executable) && !out.some(item => item.executable === executable)) {
    out.push({ id, kind, executable })
  }
}

async function windowsCandidates(): Promise<BrowserCandidate[]> {
  const out: BrowserCandidate[] = []
  const pf = process.env.PROGRAMFILES ?? 'C:\\Program Files'
  const pf86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const paths: Array<[string, BrowserKind, string]> = [
    ['chrome', 'chrome', join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['chrome-x86', 'chrome', join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['chrome-local', 'chrome', join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['edge', 'edge', join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['edge-x86', 'edge', join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['brave', 'brave', join(local, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')],
    ['chromium', 'chromium', join(local, 'Chromium', 'Application', 'chrome.exe')],
  ]
  for (const [id, kind, executable] of paths) pushIfExists(out, id, kind, executable)
  try {
    const { stdout } = await exec('reg', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      '/ve',
    ])
    const match = stdout.match(/REG_SZ\s+(.+\.exe)/i)
    if (match?.[1]) pushIfExists(out, 'chrome-app-path', 'chrome', match[1].trim())
  } catch {
    /* registry optional */
  }
  return out
}

function macCandidates(): BrowserCandidate[] {
  const out: BrowserCandidate[] = []
  const apps: Array<[string, BrowserKind, string]> = [
    ['chrome', 'chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    ['edge', 'edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    ['brave', 'brave', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    ['chromium', 'chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  ]
  for (const [id, kind, executable] of apps) pushIfExists(out, id, kind, executable)
  return out
}

function linuxCandidates(): BrowserCandidate[] {
  const out: BrowserCandidate[] = []
  const names: Array<[string, BrowserKind]> = [
    ['google-chrome', 'chrome'],
    ['google-chrome-stable', 'chrome'],
    ['microsoft-edge', 'edge'],
    ['microsoft-edge-stable', 'edge'],
    ['brave-browser', 'brave'],
    ['chromium', 'chromium'],
    ['chromium-browser', 'chromium'],
  ]
  const pathDirs = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
  for (const [name, kind] of names) {
    for (const dir of pathDirs) pushIfExists(out, name, kind, join(dir, name))
  }
  return out
}

export async function discoverBrowsers(options?: {
  fsExists?: (path: string) => boolean
  platform?: NodeJS.Platform
}): Promise<BrowserCandidate[]> {
  if (options?.fsExists) {
    const fake: BrowserCandidate[] = []
    const check = options.fsExists
    const probe = (id: string, kind: BrowserKind, executable: string) => {
      if (check(executable)) fake.push({ id, kind, executable })
    }
    probe('chrome', 'chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    probe('edge', 'edge', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe')
    probe('brave', 'brave', join(homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'))
    probe('path-chrome', 'chrome', join('C:\\fake-path', 'chrome.exe'))
    return fake
  }
  const platform = options?.platform ?? process.platform
  if (platform === 'win32') return windowsCandidates()
  if (platform === 'darwin') return macCandidates()
  return linuxCandidates()
}

export function preferCandidate(
  candidates: BrowserCandidate[],
  preferred: 'auto' | BrowserKind,
): BrowserCandidate | undefined {
  if (preferred !== 'auto') return candidates.find(item => item.kind === preferred) ?? candidates[0]
  const order: BrowserKind[] = ['chrome', 'edge', 'brave', 'chromium', 'managed']
  for (const kind of order) {
    const hit = candidates.find(item => item.kind === kind)
    if (hit) return hit
  }
  return candidates[0]
}
