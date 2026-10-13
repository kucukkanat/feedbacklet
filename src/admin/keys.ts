import { getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { generateSeedWords, privateKeyFromSeedWords } from 'nostr-tools/nip06'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'

// Signing in is done with the nsec only. The secret key lives in sessionStorage until the
// tab is closed or the user signs out; localStorage only remembers the public key.

const LS_KEY = 'feedbacklet.admin.identity'
const SS_KEY = 'feedbacklet.admin.session'

export interface StoredIdentity {
  pubkey: string
  createdAt: number
}

export interface Identity {
  pubkey: string
  sk: Uint8Array
}

export interface NewIdentity extends Identity {
  mnemonic: string
}

export function storedIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as StoredIdentity) : null
  } catch {
    return null
  }
}

/** Public key of the last signed-in admin (used by the generator to prefill). */
export function storedNpub(): string | null {
  const id = storedIdentity()
  return id ? nip19.npubEncode(id.pubkey) : null
}

function remember(sk: Uint8Array): Identity {
  const pubkey = getPublicKey(sk)
  if (storedIdentity()?.pubkey !== pubkey) {
    localStorage.setItem(LS_KEY, JSON.stringify({ pubkey, createdAt: Date.now() } satisfies StoredIdentity))
  }
  sessionStorage.setItem(SS_KEY, bytesToHex(sk))
  return { pubkey, sk }
}

/** New key derived from a fresh 12-word NIP-06 mnemonic. */
export function createIdentity(): NewIdentity {
  const mnemonic = generateSeedWords()
  const sk = privateKeyFromSeedWords(mnemonic)
  return { ...remember(sk), mnemonic }
}

export function signIn(input: string): Identity {
  const v = input.trim()
  if (!v.startsWith('nsec1')) throw new Error('Paste your nsec (starts with nsec1…)')
  let d: ReturnType<typeof nip19.decode>
  try {
    d = nip19.decode(v)
  } catch {
    throw new Error('Invalid nsec')
  }
  if (d.type !== 'nsec') throw new Error('Invalid nsec')
  return remember(d.data)
}

export function sessionIdentity(): Identity | null {
  const hex = sessionStorage.getItem(SS_KEY)
  if (!hex) return null
  const sk = hexToBytes(hex)
  return { pubkey: getPublicKey(sk), sk }
}

export function signOut() {
  sessionStorage.removeItem(SS_KEY)
}

export function forget() {
  signOut()
  localStorage.removeItem(LS_KEY)
}

export const encodeNsec = (sk: Uint8Array) => nip19.nsecEncode(sk)
export const encodeNpub = (pk: string) => nip19.npubEncode(pk)
