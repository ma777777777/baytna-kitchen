// A small offline-first sync engine.
// Every piece of household data is a row keyed by (collection, key) holding JSON.
// Writes apply locally at once, go into an outbox persisted on the device, and are
// pushed when online. The server stamps updated_at, and the last write to a row wins.

export type Collection =
  | 'settings' | 'plan' | 'week' | 'pantry' | 'list_state' | 'list_extra' | 'leftover' | 'rating' | 'recipe'

export interface Row<T = unknown> {
  collection: Collection
  key: string
  data: T | null
  deleted: boolean
  updated_at: string
  updated_by: string | null
}

export interface Backend {
  /** Fetch rows changed at or after `since` (server time). */
  pull(since: string | null): Promise<Row[]>
  push(rows: Row[]): Promise<void>
  subscribe(onRows: (rows: Row[]) => void, onStatus: (live: boolean) => void): () => void
}

const id = (r: Pick<Row, 'collection' | 'key'>) => `${r.collection}|${r.key}`

interface Persisted {
  rows: Row[]
  outbox: Row[]
  lastPulled: string | null
}

export type SyncStatus = 'demo' | 'synced' | 'syncing' | 'offline' | 'pending'

export class Repo {
  private rows = new Map<string, Row>()
  private outbox = new Map<string, Row>()
  /** Server rows that arrived while we had a pending write for the same key. */
  private deferred = new Map<string, Row>()
  private lastPulled: string | null = null
  private listeners = new Set<() => void>()
  private unsub?: () => void
  private timer?: number
  private flushing = false
  private live = false
  version = 0
  status: SyncStatus
  lastSyncedAt: string | null = null

  private readonly storageKey: string
  private readonly backend: Backend | null
  private readonly userId: string | null

  constructor(storageKey: string, backend: Backend | null, userId: string | null) {
    this.storageKey = storageKey
    this.backend = backend
    this.userId = userId
    this.status = backend ? 'syncing' : 'demo'
    this.load()
  }

  // ---------- reading ----------

  get<T>(collection: Collection, key: string): T | undefined {
    const r = this.rows.get(id({ collection, key }))
    return r && !r.deleted ? (r.data as T) : undefined
  }

  all<T>(collection: Collection): { key: string; data: T; row: Row<T> }[] {
    const out: { key: string; data: T; row: Row<T> }[] = []
    for (const r of this.rows.values()) {
      if (r.collection === collection && !r.deleted && r.data != null) out.push({ key: r.key, data: r.data as T, row: r as Row<T> })
    }
    return out
  }

  pendingCount() {
    return this.outbox.size
  }

  // ---------- writing ----------

  set<T>(collection: Collection, key: string, data: T | null) {
    const row: Row = {
      collection,
      key,
      data: data as unknown,
      deleted: data === null,
      updated_at: new Date().toISOString(),
      updated_by: this.userId,
    }
    this.rows.set(id(row), row)
    if (this.backend) this.outbox.set(id(row), row)
    this.changed()
    void this.flush()
  }

  /** Apply many writes as one change (used by demo seeding and plan generation). */
  setMany(entries: { collection: Collection; key: string; data: unknown }[]) {
    const now = new Date().toISOString()
    for (const e of entries) {
      const row: Row = { ...e, deleted: e.data === null, updated_at: now, updated_by: this.userId }
      this.rows.set(id(row), row)
      if (this.backend) this.outbox.set(id(row), row)
    }
    this.changed()
    void this.flush()
  }

  // ---------- sync ----------

  async start() {
    if (!this.backend) return
    this.unsub = this.backend.subscribe(
      (rows) => this.merge(rows),
      (live) => {
        this.live = live
        if (live) void this.pull() // catch up on anything missed while disconnected
        this.updateStatus()
      },
    )
    // Fallback for flaky realtime connections: incremental pull every 60 s while visible.
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.flush().then(() => this.pull())
    }, 60_000)
    window.addEventListener('online', this.onOnline)
    document.addEventListener('visibilitychange', this.onVisible)
    await this.pull()
    await this.flush()
  }

  stop() {
    this.unsub?.()
    window.clearInterval(this.timer)
    window.removeEventListener('online', this.onOnline)
    document.removeEventListener('visibilitychange', this.onVisible)
  }

  private onOnline = () => {
    void this.flush().then(() => this.pull())
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') void this.flush().then(() => this.pull())
  }

  async pull() {
    if (!this.backend) return
    try {
      // Overlap by a minute: rows can commit slightly out of timestamp order.
      const since = this.lastPulled ? new Date(Date.parse(this.lastPulled) - 60_000).toISOString() : null
      const rows = await this.backend.pull(since)
      this.merge(rows)
      this.lastSyncedAt = new Date().toISOString()
    } catch {
      // offline or server unreachable; cached data stays visible
    }
    this.updateStatus()
  }

  async flush() {
    if (!this.backend || this.flushing || this.outbox.size === 0) return this.updateStatus()
    this.flushing = true
    this.updateStatus()
    try {
      while (this.outbox.size) {
        const batch = [...this.outbox.values()].slice(0, 200)
        await this.backend.push(batch)
        const applied: Row[] = []
        for (const r of batch) {
          // only clear if nothing newer was written meanwhile
          if (this.outbox.get(id(r)) !== r) continue
          this.outbox.delete(id(r))
          const d = this.deferred.get(id(r))
          if (d) {
            this.deferred.delete(id(r))
            applied.push(d)
          }
        }
        // The server's copy (possibly someone else's later write) now wins.
        if (applied.length) this.merge(applied)
        else this.persist()
      }
      this.lastSyncedAt = new Date().toISOString()
      void this.pull()
    } catch {
      // keep the outbox; retry on reconnect / next write / visibility change
    } finally {
      this.flushing = false
      this.updateStatus()
    }
  }

  /** Merge server rows. A row with a pending local write is kept as the local version. */
  merge(rows: Row[]) {
    let touched = false
    for (const r of rows) {
      if (!this.lastPulled || r.updated_at > this.lastPulled) this.lastPulled = r.updated_at
      if (this.outbox.has(id(r))) {
        const d = this.deferred.get(id(r))
        if (!d || r.updated_at > d.updated_at) this.deferred.set(id(r), r)
        continue
      }
      const cur = this.rows.get(id(r))
      if (cur && cur.updated_at === r.updated_at && cur.deleted === r.deleted) continue
      this.rows.set(id(r), r)
      touched = true
    }
    if (touched) this.changed()
    else this.persist()
  }

  private updateStatus() {
    let next: SyncStatus
    if (!this.backend) next = 'demo'
    else if (typeof navigator !== 'undefined' && navigator.onLine === false) next = 'offline'
    else if (this.flushing) next = 'syncing'
    else if (this.outbox.size) next = 'pending'
    else if (!this.live && !this.lastSyncedAt) next = 'offline'
    else next = 'synced'
    if (next !== this.status) {
      this.status = next
      this.emit()
    }
  }

  // ---------- persistence & subscription ----------

  private load() {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const p = JSON.parse(raw) as Persisted
      for (const r of p.rows) this.rows.set(id(r), r)
      for (const r of p.outbox ?? []) this.outbox.set(id(r), r)
      this.lastPulled = p.lastPulled ?? null
    } catch {
      // corrupt or unavailable storage: start empty
    }
  }

  private persist() {
    try {
      const p: Persisted = { rows: [...this.rows.values()], outbox: [...this.outbox.values()], lastPulled: this.lastPulled }
      localStorage.setItem(this.storageKey, JSON.stringify(p))
    } catch {
      // storage full or blocked: the app still works for this session
    }
  }

  private changed() {
    this.version++
    this.persist()
    this.emit()
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => `${this.version}:${this.status}`
}
