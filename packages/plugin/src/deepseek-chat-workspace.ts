import { mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkspaceLike, WorkspaceRegistryLike } from './dsh-session.ts'
import { DEEPSEEK_CHAT_WORKSPACE_TITLE } from './workspace-title.ts'

export { DEEPSEEK_CHAT_WORKSPACE_TITLE } from './workspace-title.ts'

export function deepSeekChatWorkspaceDir(home: string): string {
  return join(home, 'deepseek-web', 'workspace')
}

export async function ensureDeepSeekChatWorkspace(input: {
  home: string
  workspaces?: WorkspaceRegistryLike
}): Promise<{ path: string; id?: string; workspace?: WorkspaceLike }> {
  const raw = deepSeekChatWorkspaceDir(input.home)
  await mkdir(raw, { recursive: true })
  const registry = input.workspaces
  if (registry?.create === undefined) {
    return { path: await resolveExisting(raw) }
  }
  const workspace = await registry.create(raw, DEEPSEEK_CHAT_WORKSPACE_TITLE)
  if (workspace.title !== DEEPSEEK_CHAT_WORKSPACE_TITLE && workspace.setTitle !== undefined) {
    await workspace.setTitle(DEEPSEEK_CHAT_WORKSPACE_TITLE)
  }
  return { path: workspace.path, id: workspace.id, workspace }
}

async function resolveExisting(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return path
  }
}
