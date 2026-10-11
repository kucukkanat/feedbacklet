import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import * as nip49 from 'nostr-tools/nip49'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'

// The admin secret key is only ever persisted as a NIP-49 ncryptsec (scrypt + XChaCha20).
// "Remember for this tab" keeps the raw key in sessionStorage until the tab closes.

const LS_KEY = 'feedbacklet.admin.identity'
const SS_KEY = 'feedbacklet.admin.session'

export interface StoredIdentity {
  pubkey: string
  ncryptsec: string
  createdAt: number
}

export interface Identity {
  pubkey: string
  sk: Uint8Array
}

export function storedIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as StoredIdentity) : null
  } catch {
    return null
  }
}

/** Public key of the stored admin identity (used by the generator to prefill). */
export function storedNpub(): string | null {
  const id = storedIdentity()
  return id ? nip19.npubEncode(id.pubkey) : null
}

function persist(sk: Uint8Array, passphrase: string): Identity {
  const pubkey = getPublicKey(sk)
  const ncryptsec = nip49.encrypt(sk, passphrase, 16, 0x02)
  localStorage.setItem(LS_KEY, JSON.stringify({ pubkey, ncryptsec, createdAt: Date.now() } satisfies StoredIdentity))
  return { pubkey, sk }
}

export function createIdentity(passphrase: string): Identity {
  return persist(generateSecretKey(), passphrase)
}

/** Accepts nsec, 64-char hex, or ncryptsec (decrypted with `importPassphrase`). */
export function importIdentity(input: string, passphrase: string, importPassphrase?: string): Identity {
  const v = input.trim()
  let sk: Uint8Array
  if (v.startsWith('nsec1')) {
    const d = nip19.decode(v)
    if (d.type !== 'nsec') throw new Error('Invalid nsec')
    sk = d.data
  } else if (/^[0-9a-f]{64}$/i.test(v)) {
    sk = hexToBytes(v.toLowerCase())
  } else if (v.startsWith('ncryptsec1')) {
    sk = nip49.decrypt(v, importPassphrase ?? passphrase)
  } else {
    throw new Error('Paste an nsec, ncryptsec or 64-char hex secret key')
  }
  return persist(sk, passphrase)
}

export function unlock(passphrase: string, remember: boolean): Identity {
  const id = storedIdentity()
  if (!id) throw new Error('No identity stored')
  let sk: Uint8Array
  try {
    sk = nip49.decrypt(id.ncryptsec, passphrase)
  } catch {
    throw new Error('Wrong passphrase')
  }
  if (getPublicKey(sk) !== id.pubkey) throw new Error('Stored key is corrupted')
  const identity = { pubkey: id.pubkey, sk }
  if (remember) rememberSession(identity)
  return identity
}

export function rememberSession(identity: Identity) {
  sessionStorage.setItem(SS_KEY, bytesToHex(identity.sk))
}

export function sessionIdentity(): Identity | null {
  const id = storedIdentity()
  const hex = sessionStorage.getItem(SS_KEY)
  if (!id || !hex) return null
  const sk = hexToBytes(hex)
  return getPublicKey(sk) === id.pubkey ? { pubkey: id.pubkey, sk } : null
}

export function lock() {
  sessionStorage.removeItem(SS_KEY)
}

export function forget() {
  lock()
  localStorage.removeItem(LS_KEY)
}

export function changePassphrase(identity: Identity, passphrase: string) {
  persist(identity.sk, passphrase)
}

export const encodeNsec = (sk: Uint8Array) => nip19.nsecEncode(sk)
export const encodeNpub = (pk: string) => nip19.npubEncode(pk)
