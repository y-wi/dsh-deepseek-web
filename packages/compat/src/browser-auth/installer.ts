import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { DeepSeekWebError, ERROR_CODES } from '../errors.ts'
import type { BrowserCandidate } from '../types.ts'

export interface InstallerLock {
  acquire(): Promise<() => Promise<void>>
}

class FileLock implements InstallerLock {
  constructor(private readonly path: string) {}
  async acquire(): Promise<() => Promise<void>> {
    await mkdir(join(this.path, '..'), { recursive: true })
    const handle = await import('node:fs/promises').then(fs => fs.open(this.path, 'wx').catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
      await new Promise(resolve => setTimeout(resolve, 250))
      return fs.open(this.path, 'wx')
    }))
    return async () => {
      await handle.close()
      await rm(this.path, { force: true })
    }
  }
}

export async function installManagedBrowser(options: {
  cacheDir: string
  allowDownload: boolean
  onProgress?: (progress: number) => void
  fetchImpl?: typeof fetch
}): Promise<BrowserCandidate> {
  if (!options.allowDownload) {
    throw new DeepSeekWebError('managed browser download is disabled', ERROR_CODES.BROWSER_INSTALL)
  }
  await mkdir(options.cacheDir, { recursive: true })
  const lock = new FileLock(join(options.cacheDir, '.lock'))
  const release = await lock.acquire()
  try {
    try {
      const { computeExecutablePath, install } = await import('@puppeteer/browsers')
      const installed = await install({
        cacheDir: options.cacheDir,
        browser: 'chrome' as never,
        buildId: 'stable',
        downloadProgressCallback: (_downloaded: number, total: number) => {
          if (total > 0) options.onProgress?.(Math.min(1, _downloaded / total))
        },
      } as never)
      const executable = computeExecutablePath({
        cacheDir: options.cacheDir,
        browser: 'chrome' as never,
        buildId: (installed as { buildId?: string }).buildId ?? 'stable',
      } as never)
      if (!existsSync(executable)) {
        throw new DeepSeekWebError('managed browser executable missing after install', ERROR_CODES.BROWSER_INSTALL)
      }
      await writeFile(join(options.cacheDir, 'CURRENT'), executable, 'utf8')
      return { id: 'managed-chrome', kind: 'managed', executable }
    } catch (error) {
      if (error instanceof DeepSeekWebError) throw error
      throw new DeepSeekWebError('managed browser install failed', ERROR_CODES.BROWSER_INSTALL, { cause: error })
    }
  } finally {
    await release()
  }
}

export async function downloadToFile(url: string, dest: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const tmp = `${dest}.partial`
  const response = await fetchImpl(url)
  if (!response.ok || response.body === null) {
    throw new DeepSeekWebError('browser archive download failed', ERROR_CODES.BROWSER_INSTALL)
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tmp))
  await rename(tmp, dest)
}
