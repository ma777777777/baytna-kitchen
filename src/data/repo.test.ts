import { beforeEach, describe, expect, it } from 'vitest'
import { Repo, type Backend, type Row } from './repo'

// In-memory stand-in for the server: stamps updated_at, broadcasts changes like Realtime.
class FakeServer {
  rows = new Map<string, Row>()
  clock = 0
  online = true
  subscribers = new Set<(rows: Row[]) => void>()

  backend(userId: string, isOnline: () => boolean = () => this.online): Backend {
    return {
      pull: async (since) => {
        if (!isOnline()) throw new Error('offline')
        return [...this.rows.values()].filter((r) => !since || r.updated_at >= since).sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      },
      push: async (rows) => {
        if (!isOnline()) throw new Error('offline')
        const stamped = rows.map((r) => {
          const s = { ...r, updated_at: `2026-11-01T00:00:${String(++this.clock).padStart(5, '0')}Z`, updated_by: userId }
          this.rows.set(`${r.collection}|${r.key}`, s)
          return s
        })
        for (const fn of this.subscribers) fn(stamped)
      },
      subscribe: (onRows, onStatus) => {
        this.subscribers.add(onRows)
        onStatus(true)
        return () => this.subscribers.delete(onRows)
      },
    }
  }
}

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

function connect(repo: Repo, server: FakeServer, b: Backend) {
  b.subscribe((rows) => repo.merge(rows), () => {})
  void server
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = memoryStorage()
})

describe('two-person sync', () => {
  it('a tick on one phone appears on the other without refreshing', async () => {
    const server = new FakeServer()
    const ba = server.backend('a')
    const bb = server.backend('b')
    const a = new Repo('a', ba, 'a')
    const b = new Repo('b', bb, 'b')
    connect(a, server, ba)
    connect(b, server, bb)

    b.set('list_state', '2026-10-31|cucumber@main', { checked: true })
    await b.flush()
    expect(a.get('list_state', '2026-10-31|cucumber@main')).toEqual({ checked: true })
    expect(a.all('list_state')[0].row.updated_by).toBe('b')
  })

  it('queues writes while offline and sends them on reconnect, keeping the local version meanwhile', async () => {
    const server = new FakeServer()
    let bOnline = true
    const ba = server.backend('a')
    const bb = server.backend('b', () => bOnline)
    const a = new Repo('a', ba, 'a')
    const b = new Repo('b', bb, 'b')
    connect(a, server, ba)
    connect(b, server, bb)

    bOnline = false
    b.set('plan', '2026-11-02', { type: 'cook', recipeId: 'foul' })
    await b.flush()
    expect(b.pendingCount()).toBe(1)
    expect(a.get('plan', '2026-11-02')).toBeUndefined()

    // A edits another day meanwhile; B receives it but keeps its own pending edit.
    a.set('plan', '2026-11-03', { type: 'takeout' })
    await a.flush()
    expect(b.get('plan', '2026-11-03')).toEqual({ type: 'takeout' })

    bOnline = true
    await b.flush()
    expect(b.pendingCount()).toBe(0)
    expect(a.get('plan', '2026-11-02')).toEqual({ type: 'cook', recipeId: 'foul' })
  })

  it('survives an app restart with cached data and a pending outbox', async () => {
    const server = new FakeServer()
    server.online = false
    const r1 = new Repo('k', server.backend('a'), 'a')
    r1.set('pantry', 'eggs', { id: 'eggs', status: 'have' })
    await r1.flush()
    const r2 = new Repo('k', server.backend('a'), 'a') // same storage key = same phone
    expect(r2.get('pantry', 'eggs')).toEqual({ id: 'eggs', status: 'have' })
    expect(r2.pendingCount()).toBe(1)
    server.online = true
    await r2.flush()
    expect(server.rows.size).toBe(1)
  })

  it('last write wins when both edit the same row', async () => {
    const server = new FakeServer()
    const ba = server.backend('a')
    const bb = server.backend('b')
    const a = new Repo('a', ba, 'a')
    const b = new Repo('b', bb, 'b')
    connect(a, server, ba)
    connect(b, server, bb)
    a.set('plan', 'd', { type: 'cook', recipeId: 'foul' })
    b.set('plan', 'd', { type: 'cook', recipeId: 'ijjeh' })
    await a.flush()
    await b.flush()
    expect(a.get('plan', 'd')).toEqual({ type: 'cook', recipeId: 'ijjeh' })
    expect(b.get('plan', 'd')).toEqual({ type: 'cook', recipeId: 'ijjeh' })
  })

  it('demo mode never pretends to sync', () => {
    const demo = new Repo('demo', null, null)
    demo.set('plan', 'd', { type: 'free' })
    expect(demo.status).toBe('demo')
    expect(demo.pendingCount()).toBe(0)
  })
})
