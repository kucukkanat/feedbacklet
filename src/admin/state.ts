import { finalizeEvent, type Event } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'
import type { SimplePool } from 'nostr-tools/pool'
import { DEFAULT_RELAYS, STATE_D_TAG, STATE_KIND, gunzipFromBase64, gzipToBase64 } from '../shared/protocol'
import type { Identity } from './keys'

// Admin workflow state, synced across devices as a NIP-78 (kind 30078) replaceable
// event whose content is NIP-44 encrypted to the admin's own key.

export type Status = 'new' | 'progress' | 'resolved' | 'archived'
export const STATUSES: { id: Status; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'archived', label: 'Archived' },
]

export interface ReportMeta {
  status: Status
  tags: string[]
  note?: string
  deleted?: boolean
  updatedAt: number
}

export interface AdminState {
  relays: string[]
  relaysUpdatedAt: number
  reports: Record<string, ReportMeta>
}

const LS = (pk: string) => `feedbacklet.admin.state.${pk}`

export function emptyState(): AdminState {
  return { relays: [...DEFAULT_RELAYS], relaysUpdatedAt: 0, reports: {} }
}

export function loadLocalState(pk: string): AdminState {
  try {
    const raw = localStorage.getItem(LS(pk))
    if (raw) return { ...emptyState(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return emptyState()
}

export function saveLocalState(pk: string, s: AdminState) {
  localStorage.setItem(LS(pk), JSON.stringify(s))
}

/** Last-write-wins merge, per report. */
export function mergeState(a: AdminState, b: AdminState): AdminState {
  const out: AdminState = {
    relays: b.relaysUpdatedAt > a.relaysUpdatedAt ? b.relays : a.relays,
    relaysUpdatedAt: Math.max(a.relaysUpdatedAt, b.relaysUpdatedAt),
    reports: { ...a.reports },
  }
  for (const [k, v] of Object.entries(b.reports ?? {})) if (!out.reports[k] || v.updatedAt > out.reports[k].updatedAt) out.reports[k] = v
  return out
}

function convKey(id: Identity) {
  return nip44.v2.utils.getConversationKey(id.sk, id.pubkey)
}

export async function fetchRemoteState(pool: SimplePool, relays: string[], id: Identity): Promise<AdminState | null> {
  const events = await pool.querySync(relays, { kinds: [STATE_KIND], authors: [id.pubkey], '#d': [STATE_D_TAG] }, { maxWait: 5000 })
  let merged: AdminState | null = null
  for (const ev of events.sort((x, y) => x.created_at - y.created_at)) {
    try {
      const s = JSON.parse(await gunzipFromBase64(nip44.v2.decrypt(ev.content, convKey(id)))) as AdminState
      merged = merged ? mergeState(merged, s) : { ...emptyState(), ...s }
    } catch {
      /* skip undecryptable */
    }
  }
  return merged
}

/** Content is gzip+base64 before encryption so thousands of entries fit in NIP-44's 64 KB limit. */
export async function buildStateEvent(s: AdminState, id: Identity): Promise<Event> {
  const packed = await gzipToBase64(JSON.stringify(s))
  return finalizeEvent(
    {
      kind: STATE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', STATE_D_TAG]],
      content: nip44.v2.encrypt(packed, convKey(id)),
    },
    id.sk,
  )
}
