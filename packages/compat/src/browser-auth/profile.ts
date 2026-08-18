import { chmod, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { platform } from 'node:os'

export async function ensureIsolatedProfile(root: string): Promise<string> {
  await mkdir(root, { recursive: true })
  if (platform() !== 'win32') await chmod(root, 0o700).catch(() => undefined)
  return root
}

export async function resetIsolatedProfile(root: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await rm(root, { recursive: true, force: true })
      await mkdir(root, { recursive: true })
      if (platform() !== 'win32') await chmod(root, 0o700).catch(() => undefined)
      return
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('failed to reset isolated browser profile')
}

/** Logout must wipe cookies. Kept as an alias so existing callers keep compiling. */
export async function backupAndResetProfile(root: string): Promise<void> {
  await resetIsolatedProfile(root)
}

export async function readDevToolsActivePort(userDataDir: string): Promise<{ port: number; browserWS: string }> {
  const text = await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8')
  const [portLine, pathLine] = text.split(/\r?\n/)
  const port = Number(portLine)
  if (!Number.isInteger(port) || port <= 0) throw new Error('invalid DevToolsActivePort')
  const path = (pathLine ?? '').trim() || '/devtools/browser'
  return { port, browserWS: `ws://127.0.0.1:${port}${path.startsWith('/') ? path : `/${path}`}` }
}
