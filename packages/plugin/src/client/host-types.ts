/** Structural controller faces, shared by Web and Desktop. */
export interface HarnessSessionsLike {
  refresh?(): Promise<void>
  list?: {
    getSnapshot(): {
      ids?: readonly string[]
      byId?: Readonly<Record<string, unknown>>
      items?: ReadonlyArray<{ id?: string }>
    }
    subscribe?(fn: () => void): () => void
  }
}

export interface HarnessWorkspacesLike {
  refresh?(): Promise<void>
  list?: {
    getSnapshot(): {
      items?: ReadonlyArray<{ workspaceId?: string; id?: string; title?: string; path?: string }>
    }
  }
}
