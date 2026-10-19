import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import type { SessionEventLike, SessionHeaderLike, SessionPersistenceLike } from './dsh-session.ts'

interface SessionHandle {
  header: SessionHeaderLike
  inheritedEventCount: number
  read(): Promise<{ events: readonly SessionEventLike[] }>
  append(events: readonly SessionEventLike[]): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

/** Harness 0.2 persistence owns reads and writes through explicit handles. */
export interface HandlePersistence {
  create(header: SessionHeaderLike & { isSeeded: boolean }, options?: { inheritedEventCount?: number }): Promise<SessionHandle>
  open(id: string, access: 'read' | 'write'): Promise<SessionHandle>
  list(): Promise<readonly { header: SessionHeaderLike }[]>
}

export function adaptPersistence(service: HandlePersistence | undefined): SessionPersistenceLike | undefined {
  if (service === undefined) return undefined
  const pending = new Map<string, SessionHeaderLike>()
  return {
    async create(header) {
      if (pending.has(header.id)) throw new Error('session creation already pending')
      pending.set(header.id, header)
    },
    async append(id, events) {
      const header = pending.get(id)
      pending.delete(id)
      const inheritedEventCount = header?.seedLength
      const seeded = inheritedEventCount !== undefined
      const { seedLength: _cut, ...metadata } = header ?? {} as SessionHeaderLike
      const handle = header === undefined
        ? await service.open(id, 'write')
        : await service.create({ ...metadata, isSeeded: seeded } as SessionHeaderLike & { isSeeded: boolean },
          seeded ? { inheritedEventCount } : undefined)
      try {
        const batch = seeded && events.length > 0
          ? buildForkSeed(events as never, (events.length - 1) as never) as unknown as SessionEventLike[]
          : events
        await handle.append(batch)
        await handle.flush()
      } finally {
        await handle.close()
      }
    },
    async list() {
      return (await service.list()).map(snapshot => snapshot.header)
    },
    async inspect(id) {
      const handle = await service.open(id, 'read')
      try {
        const { events } = await handle.read()
        return { meta: { ...handle.header,
          ...(handle.header.isSeeded === true ? { seedLength: handle.inheritedEventCount } : {}),
        }, events }
      } finally {
        await handle.close()
      }
    },
  }
}
