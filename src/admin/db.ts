import type { ReportPayload } from '../shared/protocol'

// Local IndexedDB cache, one database per admin pubkey.
//  seen    : wrapId → 1             (gift wraps already processed)
//  chunks  : `${sender}:${rid}:${i}` → Chunk
//  reports : rid → StoredReport

export interface Chunk {
  key: string
  group: string // `${sender}:${rid}`
  i: number
  n: number
  content: string
}

export interface StoredReport {
  id: string
  sender: string
  receivedAt: number
  payload: ReportPayload
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export class Db {
  private constructor(private db: IDBDatabase) {}

  static async open(pubkey: string): Promise<Db> {
    const r = indexedDB.open(`feedbacklet-${pubkey.slice(0, 16)}`, 1)
    r.onupgradeneeded = () => {
      const db = r.result
      db.createObjectStore('seen')
      db.createObjectStore('chunks', { keyPath: 'key' }).createIndex('group', 'group')
      db.createObjectStore('reports', { keyPath: 'id' })
    }
    return new Db(await req(r))
  }

  private store(name: string, mode: IDBTransactionMode = 'readonly') {
    return this.db.transaction(name, mode).objectStore(name)
  }

  async seen(wrapId: string) {
    return (await req(this.store('seen').count(wrapId))) > 0
  }
  markSeen(wrapId: string) {
    return req(this.store('seen', 'readwrite').put(1, wrapId))
  }
  putChunk(c: Chunk) {
    return req(this.store('chunks', 'readwrite').put(c))
  }
  chunksFor(group: string): Promise<Chunk[]> {
    return req(this.store('chunks').index('group').getAll(group))
  }
  async deleteChunks(group: string) {
    const s = this.store('chunks', 'readwrite')
    const keys = await req(s.index('group').getAllKeys(group))
    await Promise.all(keys.map((k) => req(s.delete(k))))
  }
  getReport(id: string): Promise<StoredReport | undefined> {
    return req(this.store('reports').get(id))
  }
  putReport(r: StoredReport) {
    return req(this.store('reports', 'readwrite').put(r))
  }
  deleteReport(id: string) {
    return req(this.store('reports', 'readwrite').delete(id))
  }
  allReports(): Promise<StoredReport[]> {
    return req(this.store('reports').getAll())
  }
  async clear() {
    for (const n of ['seen', 'chunks', 'reports']) await req(this.store(n, 'readwrite').clear())
  }
}
