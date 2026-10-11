import type { Event } from 'nostr-tools/pure'
import { unwrapEvent } from 'nostr-tools/nip59'
import type { SimplePool, SubCloser } from 'nostr-tools/pool'
import { MAX_CHUNKS, RUMOR_KIND, decodePayload, tagValue } from '../shared/protocol'
import type { Db, StoredReport } from './db'
import type { Identity } from './keys'

/**
 * Subscribes to gift wraps addressed to the admin, unwraps them, collects chunks per
 * (sender, report id) and emits complete reports. All chunks of a report must be sealed
 * by the same throw-away key, so a third party cannot inject chunks into someone else's report.
 */
export function subscribeInbox(
  pool: SimplePool,
  relays: string[],
  id: Identity,
  db: Db,
  handlers: { onReport: (r: StoredReport) => void; onEose: () => void; onProgress?: (processed: number) => void },
): SubCloser {
  let processed = 0
  const queue: Event[] = []
  let busy = false

  async function handle(wrap: Event) {
    if (await db.seen(wrap.id)) return
    await db.markSeen(wrap.id)
    let rumor
    try {
      rumor = unwrapEvent(wrap, id.sk)
    } catch {
      return // not for us / malformed
    }
    if (rumor.kind !== RUMOR_KIND) return
    const rid = tagValue(rumor.tags, 'r')?.[0]
    const [iStr, nStr] = tagValue(rumor.tags, 'chunk') ?? []
    const i = Number(iStr), n = Number(nStr)
    if (!rid || !/^[0-9a-f]{8,64}$/.test(rid) || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > MAX_CHUNKS || i < 0 || i >= n) return
    if (await db.getReport(rid)) return
    const group = `${rumor.pubkey}:${rid}`
    await db.putChunk({ key: `${group}:${i}`, group, i, n, content: rumor.content })
    const chunks = (await db.chunksFor(group)).filter((c) => c.n === n)
    if (chunks.length < n) return
    chunks.sort((a, b) => a.i - b.i)
    try {
      const payload = await decodePayload(chunks.map((c) => c.content))
      if (payload.id !== rid) return
      const report: StoredReport = { id: rid, sender: rumor.pubkey, receivedAt: Date.now(), payload }
      await db.putReport(report)
      await db.deleteChunks(group)
      handlers.onReport(report)
    } catch (err) {
      console.warn('Failed to decode report', rid, err)
    }
  }

  async function drain() {
    if (busy) return
    busy = true
    while (queue.length) {
      await handle(queue.shift()!)
      handlers.onProgress?.(++processed)
    }
    busy = false
  }

  return pool.subscribeMany(relays, { kinds: [1059], '#p': [id.pubkey] }, {
    onevent(ev) {
      queue.push(ev)
      drain()
    },
    oneose() {
      const wait = () => (busy || queue.length ? setTimeout(wait, 100) : handlers.onEose())
      wait()
    },
  })
}
