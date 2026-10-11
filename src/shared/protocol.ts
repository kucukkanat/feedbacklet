// Wire protocol shared by the widget (sender) and the admin app (receiver).
//
// payload JSON → gzip → base64 → split into chunks. Every chunk becomes its own
// NIP-59 gift wrap so that each relay event stays well below common size limits.

export const RUMOR_KIND = 1991
export const STATE_KIND = 30078
export const STATE_D_TAG = 'feedbacklet/state'
export const PROTOCOL_VERSION = 1
/** base64 characters per chunk; keeps the final kind-1059 event around ~40 KB. */
export const CHUNK_SIZE = 16_000
export const MAX_CHUNKS = 64

export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net']

export type ReportType = 'feedback' | 'bug'

export interface ConsoleEntry {
  level: string
  time: number
  message: string
}

export interface PickedElement {
  selector: string
  tag: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  html: string
}

export interface ReportPayload {
  v: number
  id: string
  type: ReportType
  project: { id: string; name?: string }
  createdAt: number
  name?: string
  title?: string
  message: string
  expected?: string
  mood?: string
  page?: { url: string; title: string }
  data: {
    basics?: Record<string, unknown>
    console?: { logs: ConsoleEntry[]; errors: ConsoleEntry[]; failedResources: unknown[]; capturedSince: number }
    storage?: Record<string, unknown>
    dom?: { selection?: string; element?: PickedElement }
  }
  screenshot?: string // data URL
}

// ---------- encoding ----------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function gzipToBase64(text: string): Promise<string> {
  return bytesToBase64(await pipe(new TextEncoder().encode(text), new CompressionStream('gzip')))
}

export async function gunzipFromBase64(b64: string): Promise<string> {
  return new TextDecoder().decode(await pipe(base64ToBytes(b64), new DecompressionStream('gzip')))
}

export async function encodePayload(payload: ReportPayload): Promise<string[]> {
  const b64 = await gzipToBase64(JSON.stringify(payload))
  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) chunks.push(b64.slice(i, i + CHUNK_SIZE))
  if (chunks.length > MAX_CHUNKS) throw new Error(`Report too large (${chunks.length} chunks)`)
  return chunks
}

export async function decodePayload(chunks: string[]): Promise<ReportPayload> {
  return JSON.parse(await gunzipFromBase64(chunks.join('')))
}

export function randomId(bytes = 16): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function tagValue(tags: string[][], name: string): string[] | undefined {
  return tags.find((t) => t[0] === name)?.slice(1)
}
