import { spawn, type ChildProcess } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DeepSeekWebError, ERROR_CODES } from '../errors.ts'
import { readDevToolsActivePort } from './profile.ts'

export interface LaunchedBrowser {
  process: ChildProcess
  userDataDir: string
  port: number
  browserWS: string
  executable: string
}

export async function launchIsolatedBrowser(options: {
  executable: string
  userDataDir: string
  extraArgs?: string[]
}): Promise<LaunchedBrowser> {
  const args = [
    `--user-data-dir=${options.userDataDir}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
    ...(options.extraArgs ?? []),
  ]
  if (args.some(arg => arg.includes('disable-web-security') || arg.includes('ignore-certificate-errors'))) {
    throw new DeepSeekWebError('refusing insecure browser flags', ERROR_CODES.BROWSER_LAUNCH)
  }
  await rm(join(options.userDataDir, 'DevToolsActivePort'), { force: true })
  const startedAt = Date.now()
  const child = spawn(options.executable, args, {
    stdio: 'ignore',
    windowsHide: false,
    detached: false,
  })
  child.on('error', () => undefined)
  const deadline = Date.now() + 15_000
  let lastError: unknown
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new DeepSeekWebError('browser process exited before publishing DevTools', ERROR_CODES.BROWSER_LAUNCH)
    }
    try {
      const info = await readDevToolsActivePort(options.userDataDir)
      const stamp = await stat(join(options.userDataDir, 'DevToolsActivePort'))
      if (stamp.mtimeMs + 25 < startedAt) throw new Error('stale DevToolsActivePort')
      return { process: child, userDataDir: options.userDataDir, executable: options.executable, ...info }
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }
  await killProcessTree(child.pid)
  throw new DeepSeekWebError('browser launched but DevToolsActivePort was not published', ERROR_CODES.BROWSER_LAUNCH, {
    cause: lastError,
  })
}

async function killProcessTree(pid?: number): Promise<void> {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

export async function stopBrowser(launched?: LaunchedBrowser): Promise<void> {
  if (launched === undefined) return
  await killProcessTree(launched.process.pid)
}
