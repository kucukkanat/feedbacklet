import { generateSecretKey } from 'nostr-tools/pure'
import { wrapEvent } from 'nostr-tools/nip59'
import { SimplePool } from 'nostr-tools/pool'
import type { WidgetConfig } from '../shared/config'
import { RUMOR_KIND, encodePayload, type ReportPayload } from '../shared/protocol'

export interface SendResult {
  chunks: number
  relaysOk: string[]
  relaysFailed: string[]
}

/**
 * Gift-wraps every chunk with a fresh throw-away sender key (one per report) and
 * publishes to all relays. Only the admin can decrypt; relays see random pubkeys.
 */
export async function sendReport(cfg: WidgetConfig, payload: ReportPayload, onProgress: (done: number, total: number) => void): Promise<SendResult> {
  const chunks = await encodePayload(payload)
  const sk = generateSecretKey()
  const wraps = chunks.map((content, i) =>
    wrapEvent(
      {
        kind: RUMOR_KIND,
        created_at: Math.floor(payload.createdAt / 1000),
        content,
        tags: [
          ['r', payload.id],
          ['chunk', String(i), String(chunks.length)],
          ['project', payload.project.id],
          ['t', 'feedbacklet'],
        ],
      },
      sk,
      cfg.admin,
    ),
  )
  sk.fill(0)

  const pool = new SimplePool()
  const ok = new Set<string>()
  const failed = new Set<string>()
  let done = 0
  try {
    for (const relay of cfg.relays) {
      let relayOk = true
      for (const wrap of wraps) {
        try {
          await Promise.any(pool.publish([relay], wrap, { maxWait: 8000 }))
        } catch {
          relayOk = false
        }
        onProgress(++done, wraps.length * cfg.relays.length)
      }
      ;(relayOk ? ok : failed).add(relay)
    }
  } finally {
    pool.close(cfg.relays)
  }
  if (!ok.size) throw new Error('No relay accepted the report. Check your connection or the relay list.')
  return { chunks: chunks.length, relaysOk: [...ok], relaysFailed: [...failed] }
}
