#!/usr/bin/env node
import { cp, mkdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants as fsConstants } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const generated = join(root, 'packages', 'compat', 'generated')
const pluginWasm = join(root, 'packages', 'plugin', 'wasm')

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

await mkdir(pluginWasm, { recursive: true })

const generatedWasm = join(generated, 'deepseek_web_core_bg.wasm')
const destWasm = join(pluginWasm, 'deepseek_web_core_bg.wasm')

if (await exists(generatedWasm)) {
  await cp(generatedWasm, destWasm)
  await cp(join(generated, 'deepseek_web_core.js'), join(pluginWasm, 'deepseek_web_core.js'))
  try {
    await cp(join(generated, 'protocol-core-manifest.json'), join(pluginWasm, 'protocol-core-manifest.json'))
  } catch {
    /* generated manifest is optional for tsc-only private builds */
  }
} else if (!(await exists(destWasm))) {
  console.error('prebuilt WASM is missing; public trees must ship packages/plugin/wasm/deepseek_web_core_bg.wasm')
  process.exit(1)
}
