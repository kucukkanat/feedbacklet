import './site.css'
import { nip19 } from 'nostr-tools'
import { h } from '../shared/dom'
import { buildBookmarklet, buildEmbedSnippet, toHexPubkey, type WidgetConfig } from '../shared/config'
import { DEFAULT_RELAYS } from '../shared/protocol'
import { storedNpub } from '../admin/keys'
import { open } from '../widget'
import { copy, mountNav, widgetUrl } from './layout'

mountNav('generator')

const LS = 'feedbacklet.generator'
const form = document.getElementById('form') as HTMLFormElement
const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement
const relaysEl = document.getElementById('relays')!
const bm = document.getElementById('bm') as HTMLAnchorElement
const code = document.getElementById('code')!
const errors = document.getElementById('errors')!
const size = document.getElementById('size')!
const adminMsg = document.getElementById('admin-msg')!
const adminMsgDefault = adminMsg.innerHTML
let tab = 'bookmarklet'
let relays: string[] = [...DEFAULT_RELAYS]
let config: WidgetConfig | null = null

interface Saved {
  admin: string
  projectName: string
  projectId: string
  title: string
  accent: string
  src: string
  relays: string[]
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

function renderRelays() {
  relaysEl.replaceChildren(
    ...relays.map((r, i) =>
      h('div', { class: 'relay-item' },
        h('input', { type: 'text', value: r, spellcheck: 'false', oninput: (e: Event) => { relays[i] = (e.target as HTMLInputElement).value.trim(); update() } }),
        h('button', { type: 'button', class: 'btn sm', title: 'Remove', onclick: () => { relays.splice(i, 1); renderRelays(); update() } }, '×'),
      )),
  )
}

function load() {
  let saved: Partial<Saved> = {}
  // share links: generator.html#c=<base64url config>
  const m = location.hash.match(/[#&]c=([^&]+)/)
  if (m) {
    try {
      const c = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))) as WidgetConfig
      saved = { admin: nip19.npubEncode(toHexPubkey(c.admin)), projectId: c.project.id, projectName: c.project.name ?? '', title: c.title ?? '', accent: c.accent ?? '#2563eb', relays: c.relays, src: c.src }
    } catch {
      /* ignore bad link */
    }
  } else {
    try {
      saved = JSON.parse(localStorage.getItem(LS) ?? '{}')
    } catch {
      /* ignore */
    }
    const prefill = location.hash.match(/[#&]admin=([^&]+)/)
    if (prefill) saved.admin = decodeURIComponent(prefill[1])
  }
  field('admin').value = saved.admin ?? storedNpub() ?? ''
  field('projectName').value = saved.projectName ?? ''
  field('projectId').value = saved.projectId ?? ''
  field('title').value = saved.title ?? ''
  field('accent').value = saved.accent ?? '#2563eb'
  field('src').value = saved.src ?? widgetUrl()
  if (saved.relays?.length) relays = saved.relays
  if (storedNpub()) document.getElementById('use-mine')!.hidden = false
}

function update() {
  const problems: string[] = []
  let admin = ''
  try {
    admin = toHexPubkey(field('admin').value)
    adminMsg.innerHTML = adminMsgDefault
  } catch {
    if (field('admin').value.trim()) problems.push('Admin key is not a valid npub or hex public key.')
    else problems.push('Enter the admin public key that should receive reports.')
  }
  const name = field('projectName').value.trim()
  if (!field('projectId').dataset.touched) field('projectId').value = slug(name)
  const id = field('projectId').value.trim()
  if (!id) problems.push('Give your project a name or ID.')
  const rl = relays.filter((r) => /^wss?:\/\/.+/.test(r))
  if (!rl.length) problems.push('Add at least one relay (wss://…).')
  const src = field('src').value.trim() || widgetUrl()

  const saved: Saved = { admin: field('admin').value.trim(), projectName: name, projectId: id, title: field('title').value.trim(), accent: field('accent').value, src, relays }
  try {
    localStorage.setItem(LS, JSON.stringify(saved))
  } catch {
    /* ignore */
  }

  errors.replaceChildren(...problems.map((p) => h('div', { class: 'error-box' }, p)))
  if (problems.length) {
    config = null
    bm.setAttribute('aria-disabled', 'true')
    bm.href = '#'
    bm.onclick = () => false
    code.textContent = '—'
    size.textContent = ''
    return
  }
  config = {
    admin,
    relays: rl,
    project: { id, ...(name ? { name } : {}) },
    src,
    ...(saved.title ? { title: saved.title } : {}),
    ...(saved.accent && saved.accent !== '#2563eb' ? { accent: saved.accent } : {}),
  }
  const url = buildBookmarklet(config)
  bm.href = url
  bm.onclick = (e) => {
    e.preventDefault()
    alert('Drag this button to your bookmarks bar instead of clicking it. Use “Test it on this page” to try it here.')
  }
  bm.removeAttribute('aria-disabled')
  bm.textContent = `✦ ${name ? 'Feedback · ' + name : 'Feedback'}`
  code.textContent = tab === 'bookmarklet' ? url : tab === 'embed' ? buildEmbedSnippet(config) : JSON.stringify(config, null, 2)
  size.textContent = tab === 'bookmarklet' ? `${url.length.toLocaleString()} characters · loads ${new URL(src).host}${new URL(src).pathname}` : ''
}

function shareLink() {
  if (!config) return ''
  const b64 = btoa(JSON.stringify(config)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${location.origin}${location.pathname}#c=${b64}`
}

load()
renderRelays()
update()

form.addEventListener('input', (e) => {
  if ((e.target as HTMLElement).getAttribute('name') === 'projectId') field('projectId').dataset.touched = '1'
  update()
})
if (field('projectId').value && field('projectId').value !== slug(field('projectName').value)) field('projectId').dataset.touched = '1'

document.getElementById('use-mine')!.addEventListener('click', () => {
  field('admin').value = storedNpub() ?? ''
  update()
})
document.getElementById('add-relay')!.addEventListener('click', () => {
  relays.push('wss://')
  renderRelays()
  ;(relaysEl.lastElementChild?.querySelector('input') as HTMLInputElement)?.focus()
})
document.getElementById('reset-relays')!.addEventListener('click', () => {
  relays = [...DEFAULT_RELAYS]
  renderRelays()
  update()
})
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab!
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)))
    update()
  }),
)
document.getElementById('copy')!.addEventListener('click', (e) => config && copy(code.textContent ?? '', e.currentTarget as HTMLElement))
document.getElementById('share')!.addEventListener('click', (e) => config && copy(shareLink(), e.currentTarget as HTMLElement))
document.getElementById('test')!.addEventListener('click', () => config && open(config))
