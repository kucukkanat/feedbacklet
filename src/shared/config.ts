import { nip19 } from 'nostr-tools'

export interface WidgetConfig {
  /** admin public key, hex */
  admin: string
  relays: string[]
  project: { id: string; name?: string }
  /** URL of feedbacklet.js */
  src?: string
  title?: string
  accent?: string
  /** open the modal as soon as the script loads (default true; embeds set false) */
  autoOpen?: boolean
}

export function toHexPubkey(input: string): string {
  const v = input.trim()
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase()
  if (v.startsWith('npub1')) {
    const d = nip19.decode(v)
    if (d.type === 'npub') return d.data
  }
  if (v.startsWith('nprofile1')) {
    const d = nip19.decode(v)
    if (d.type === 'nprofile') return d.data.pubkey
  }
  throw new Error('Not a valid npub or hex public key')
}

export function validateConfig(c: Partial<WidgetConfig> | undefined): WidgetConfig {
  if (!c || typeof c !== 'object') throw new Error('Missing Feedbacklet config')
  const admin = toHexPubkey(String(c.admin ?? ''))
  const relays = (c.relays ?? []).filter((r) => /^wss?:\/\//.test(r))
  if (!relays.length) throw new Error('No relays configured')
  const id = String(c.project?.id ?? '').trim()
  if (!id) throw new Error('Missing project id')
  return { ...c, admin, relays, project: { id, name: c.project?.name } } as WidgetConfig
}

/** Builds the javascript: URL. Re-clicking re-opens the widget without reloading the script. */
export function buildBookmarklet(config: WidgetConfig): string {
  const json = JSON.stringify(config)
  const code =
    `(function(){var c=${json};` +
    `if(window.Feedbacklet){window.Feedbacklet.open(c);return}` +
    `window.__FEEDBACKLET_CONFIG__=c;var s=document.createElement('script');s.src=c.src;` +
    `s.onerror=function(){alert('Feedbacklet could not be loaded on this page (it may be blocked by the site\\'s Content Security Policy).')};` +
    `document.documentElement.appendChild(s)})()`
  return 'javascript:' + encodeURIComponent(code).replace(/%20/g, ' ')
}

/** Equivalent snippet for site owners who want to embed it directly. */
export function buildEmbedSnippet(config: WidgetConfig): string {
  return (
    `<script>window.__FEEDBACKLET_CONFIG__=${JSON.stringify({ ...config, autoOpen: false })}</script>\n` +
    `<script src="${config.src}" async></script>\n` +
    `<!-- open with: Feedbacklet.open() -->`
  )
}
