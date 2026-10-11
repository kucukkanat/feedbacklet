import '../site/site.css'
import './admin.css'
import { SimplePool, type SubCloser } from 'nostr-tools/pool'
import { h } from '../shared/dom'
import type { ConsoleEntry, ReportPayload } from '../shared/protocol'
import { copy, mountNav } from '../site/layout'
import { Db, type StoredReport } from './db'
import { subscribeInbox } from './inbox'
import * as keys from './keys'
import { STATUSES, buildStateEvent, fetchRemoteState, loadLocalState, mergeState, saveLocalState, type AdminState, type ReportMeta, type Status } from './state'

mountNav('admin')
const app = document.getElementById('app')!

// ---------------------------------------------------------------- lock screen

function renderLock(mode?: 'unlock' | 'create' | 'import', error?: string) {
  const stored = keys.storedIdentity()
  mode ??= stored ? 'unlock' : 'create'
  const err = error ? h('div', { class: 'error-box' }, error) : null
  let body: HTMLElement

  if (mode === 'unlock' && stored) {
    const pass = h('input', { type: 'password', placeholder: 'Passphrase', autocomplete: 'current-password' })
    const remember = h('input', { type: 'checkbox', checked: true })
    body = h('form', { onsubmit: (e: Event) => { e.preventDefault(); attempt(() => keys.unlock(pass.value, remember.checked), 'unlock') } },
      h('h1', {}, 'Unlock your inbox'),
      h('p', {}, 'Your admin key is stored encrypted in this browser.'),
      h('div', { class: 'field' }, h('span', {}, 'Identity'), h('div', { class: 'mono' }, keys.encodeNpub(stored.pubkey))),
      err,
      h('label', { class: 'field' }, h('span', {}, 'Passphrase'), pass),
      h('label', { class: 'check' }, remember, 'Stay unlocked until this tab is closed'),
      h('button', { class: 'btn primary', style: 'width:100%' }, 'Unlock'),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:16px' },
        h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); if (confirm('Remove the stored key from this browser? Make sure you have a backup, or you will lose access to all reports sent to it.')) { keys.forget(); renderLock('create') } } }, 'Use a different key')),
    )
    setTimeout(() => pass.focus())
  } else {
    const seg = h('div', { class: 'seg', role: 'tablist' },
      h('button', { type: 'button', 'aria-selected': String(mode === 'create'), onclick: () => renderLock('create') }, 'Create new key'),
      h('button', { type: 'button', 'aria-selected': String(mode === 'import'), onclick: () => renderLock('import') }, 'Import existing'),
    )
    const secret = h('textarea', { rows: 2, placeholder: 'nsec1…, ncryptsec1… or hex', spellcheck: 'false', style: 'font-family:var(--mono);font-size:13px' })
    const oldPass = h('input', { type: 'password', placeholder: 'Passphrase of the ncryptsec', autocomplete: 'off' })
    const oldPassField = h('label', { class: 'field', hidden: true }, h('span', {}, 'Backup passphrase'), oldPass)
    secret.addEventListener('input', () => (oldPassField.hidden = !secret.value.trim().startsWith('ncryptsec1')))
    const pass = h('input', { type: 'password', placeholder: 'At least 8 characters', autocomplete: 'new-password' })
    const pass2 = h('input', { type: 'password', placeholder: 'Repeat passphrase', autocomplete: 'new-password' })
    body = h('form', { onsubmit: (e: Event) => {
        e.preventDefault()
        if (pass.value.length < 8) return renderLock(mode, 'Passphrase must be at least 8 characters.')
        if (pass.value !== pass2.value) return renderLock(mode, 'Passphrases do not match.')
        attempt(() => {
          const id = mode === 'create' ? keys.createIdentity(pass.value) : keys.importIdentity(secret.value, pass.value, oldPass.value || undefined)
          keys.rememberSession(id)
          return id
        }, mode!, mode === 'create')
      } },
      h('h1', {}, 'Admin inbox'),
      h('p', {}, 'Reports are encrypted to your admin key. It never leaves this browser unencrypted.'),
      seg,
      err,
      mode === 'import' ? h('label', { class: 'field' }, h('span', {}, 'Secret key'), secret) : null,
      mode === 'import' ? oldPassField : null,
      h('label', { class: 'field' }, h('span', {}, 'Protect it with a passphrase'), pass, h('small', {}, 'Used to encrypt the key at rest (NIP-49). There is no recovery.')),
      h('label', { class: 'field' }, pass2),
      h('button', { class: 'btn primary', style: 'width:100%' }, mode === 'create' ? 'Create admin key' : 'Import key'),
    )
  }
  app.replaceChildren(h('div', { class: 'lock-wrap' }, h('div', { class: 'card lock-card' }, body)))
}

function attempt(fn: () => keys.Identity, mode: 'unlock' | 'create' | 'import', isNew = false) {
  try {
    start(fn(), isNew)
  } catch (e) {
    renderLock(mode, (e as Error).message)
  }
}

// ---------------------------------------------------------------- app state

let id: keys.Identity
let db: Db
let pool: SimplePool
let sub: SubCloser | undefined
let state: AdminState
let reports: StoredReport[] = []
let selected: string | null = null
let sync: { cls: '' | 'live' | 'off'; text: string } = { cls: '', text: 'Connecting…' }
const filter = { kind: 'all' as 'all' | 'feedback' | 'bug', status: 'open' as Status | 'open' | 'all', project: 'all', tag: '', q: '' }
let publishTimer: number | undefined

const meta = (rid: string): ReportMeta => state.reports[rid] ?? { status: 'new', tags: [], updatedAt: 0 }

function setMeta(rid: string, patch: Partial<ReportMeta>) {
  state.reports[rid] = { ...meta(rid), ...patch, updatedAt: Date.now() }
  persistState()
  render()
}

function persistState() {
  saveLocalState(id.pubkey, state)
  clearTimeout(publishTimer)
  publishTimer = window.setTimeout(async () => {
    try {
      const ev = await buildStateEvent(state, id)
      await Promise.any(pool.publish(state.relays, ev))
    } catch (e) {
      console.warn('State sync failed', e)
    }
  }, 1500)
}

async function start(identity: keys.Identity, isNew = false) {
  id = identity
  db = await Db.open(id.pubkey)
  state = loadLocalState(id.pubkey)
  reports = await db.allReports()
  pool = new SimplePool()
  render()
  if (isNew) openSettings(true)
  connect()
}

async function connect() {
  sub?.close()
  sync = { cls: '', text: 'Syncing…' }
  renderSide()
  try {
    const remote = await fetchRemoteState(pool, state.relays, id)
    if (remote) {
      state = mergeState(state, remote)
      saveLocalState(id.pubkey, state)
    }
  } catch (e) {
    console.warn(e)
  }
  let fresh = 0
  sub = subscribeInbox(pool, state.relays, id, db, {
    onReport(r) {
      fresh++
      if (!reports.some((x) => x.id === r.id)) reports.push(r)
      render()
    },
    onProgress(n) {
      if (sync.cls !== 'live') {
        sync.text = `Decrypting… ${n}`
        renderSide()
      }
    },
    onEose() {
      const st = pool.listConnectionStatus()
      const up = state.relays.filter((r) => st.get(r.replace(/\/?$/, '/')) ?? st.get(r)).length
      sync = up ? { cls: 'live', text: `Live · ${up}/${state.relays.length} relays` } : { cls: 'off', text: 'No relay reachable' }
      if (fresh) document.title = `(${fresh}) Admin inbox — Feedbacklet`
      render()
    },
  })
}

// ---------------------------------------------------------------- derived data

const visible = () => reports.filter((r) => !meta(r.id).deleted)

function filtered() {
  const q = filter.q.toLowerCase()
  return visible()
    .filter((r) => {
      const p = r.payload, m = meta(r.id)
      if (filter.kind !== 'all' && p.type !== filter.kind) return false
      if (filter.status === 'open' ? m.status === 'resolved' || m.status === 'archived' : filter.status !== 'all' && m.status !== filter.status) return false
      if (filter.project !== 'all' && p.project.id !== filter.project) return false
      if (filter.tag && !m.tags.includes(filter.tag)) return false
      if (q && ![p.title, p.message, p.expected, p.name, p.page?.url, ...m.tags].some((s) => s?.toLowerCase().includes(q))) return false
      return true
    })
    .sort((a, b) => b.payload.createdAt - a.payload.createdAt)
}

function projects() {
  const map = new Map<string, { name: string; count: number }>()
  for (const r of visible()) {
    const p = r.payload.project
    const e = map.get(p.id) ?? { name: p.name || p.id, count: 0 }
    e.count++
    map.set(p.id, e)
  }
  return [...map].sort((a, b) => a[1].name.localeCompare(b[1].name))
}

function allTags() {
  const m = new Map<string, number>()
  for (const r of visible()) for (const t of meta(r.id).tags) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m].sort((a, b) => a[0].localeCompare(b[0]))
}

const title = (p: ReportPayload) => p.title || p.message.split('\n')[0].slice(0, 90) || '(no message)'
const fmtTime = (t: number) => {
  const d = new Date(t), now = new Date()
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}
const statusColor: Record<Status, string> = { new: '#2563eb', progress: '#d97706', resolved: '#16a34a', archived: '#94a3b8' }

// ---------------------------------------------------------------- rendering

let shell: HTMLElement, side: HTMLElement, list: HTMLElement, detail: HTMLElement, searchInput: HTMLInputElement

function render() {
  if (!shell || !shell.isConnected) {
    side = h('aside', { class: 'side' })
    searchInput = h('input', { type: 'search', placeholder: 'Search reports…', oninput: () => { filter.q = searchInput.value; renderList() } })
    const exportBtn = h('select', { class: 'btn sm', style: 'width:auto', title: 'Export', onchange: () => { exportReports(exportBtn.value as 'json' | 'csv'); exportBtn.value = '' } },
      h('option', { value: '' }, 'Export'), h('option', { value: 'json' }, 'JSON'), h('option', { value: 'csv' }, 'CSV'))
    list = h('section', { class: 'list' }, h('div', { class: 'list-head' }, searchInput, exportBtn), h('div', { class: 'list-items' }))
    detail = h('section', { class: 'detail' })
    shell = h('div', { class: 'shell' }, side, list, detail)
    app.replaceChildren(shell)
  }
  renderSide()
  renderList()
  renderDetail()
}

function navItem(label: string, active: boolean, onclick: () => void, count?: number, dot?: string) {
  return h('button', { class: 'nav-item', 'aria-current': String(active), onclick },
    dot ? h('span', { class: 'dot', style: `background:${dot}` }) : null, label, count !== undefined ? h('span', { class: 'count' }, String(count)) : null)
}

function renderSide() {
  if (!side) return
  const v = visible()
  const set = (patch: Partial<typeof filter>) => { Object.assign(filter, patch); selected = null; render() }
  side.replaceChildren(
    h('h4', {}, 'Inbox'),
    navItem('Everything', filter.kind === 'all', () => set({ kind: 'all' }), v.length),
    navItem('💬 Feedback', filter.kind === 'feedback', () => set({ kind: 'feedback' }), v.filter((r) => r.payload.type === 'feedback').length),
    navItem('🐞 Bugs', filter.kind === 'bug', () => set({ kind: 'bug' }), v.filter((r) => r.payload.type === 'bug').length),
    h('h4', {}, 'Status'),
    navItem('Open', filter.status === 'open', () => set({ status: 'open' }), v.filter((r) => !['resolved', 'archived'].includes(meta(r.id).status)).length),
    ...STATUSES.map((s) => navItem(s.label, filter.status === s.id, () => set({ status: s.id }), v.filter((r) => meta(r.id).status === s.id).length, statusColor[s.id])),
    navItem('All statuses', filter.status === 'all', () => set({ status: 'all' })),
    h('h4', {}, 'Projects'),
    navItem('All projects', filter.project === 'all', () => set({ project: 'all' })),
    ...projects().map(([pid, p]) => navItem(p.name, filter.project === pid, () => set({ project: pid }), p.count)),
    ...(allTags().length ? [h('h4', {}, 'Tags'), ...allTags().map(([t, n]) => navItem('# ' + t, filter.tag === t, () => set({ tag: filter.tag === t ? '' : t }), n))] : []),
    h('div', { class: 'side-foot' },
      h('div', { class: `sync ${sync.cls}` }, h('i'), sync.text),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', onclick: () => connect() }, 'Refresh'),
        h('button', { class: 'btn sm', onclick: () => openSettings() }, 'Settings'),
        h('button', { class: 'btn sm', onclick: () => { keys.lock(); sub?.close(); pool.destroy(); location.reload() } }, 'Lock'),
      ),
    ),
  )
}

function renderList() {
  const items = filtered()
  const box = list.querySelector('.list-items')!
  if (!items.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'big' }, reports.length ? '🔍' : '📭'),
      reports.length ? 'Nothing matches these filters.' : h('span', {}, 'No reports yet. ', h('a', { href: `./generator.html#admin=${keys.encodeNpub(id.pubkey)}` }, 'Create a bookmarklet'), ' and send a test.')))
    return
  }
  box.replaceChildren(...items.map((r) => {
    const p = r.payload, m = meta(r.id)
    return h('button', { class: `item ${m.status === 'new' ? 'unread' : ''}`, 'aria-current': String(r.id === selected), onclick: () => select(r.id) },
      h('div', { class: 'item-top' },
        h('span', {}, p.type === 'bug' ? '🐞 Bug' : '💬 Feedback'), '·', h('span', {}, p.project.name || p.project.id),
        h('span', { class: 'time' }, fmtTime(p.createdAt))),
      h('div', { class: 'item-title' }, title(p)),
      p.title || p.message.includes('\n') ? h('div', { class: 'item-msg' }, p.title ? p.message : p.message.split('\n').slice(1).join(' ')) : null,
      m.tags.length || m.status !== 'new'
        ? h('div', { class: 'item-tags' }, m.status !== 'new' ? h('span', { class: 'tag', style: `color:${statusColor[m.status]}` }, STATUSES.find((s) => s.id === m.status)!.label) : null, ...m.tags.map((t) => h('span', { class: 'tag' }, '#' + t)))
        : null,
    )
  }))
}

function select(rid: string) {
  selected = rid
  shell.classList.add('has-selection')
  renderList()
  renderDetail()
}

function renderDetail() {
  const r = reports.find((x) => x.id === selected)
  shell.classList.toggle('has-selection', !!r)
  if (!r) {
    detail.replaceChildren(h('div', { class: 'empty', style: 'padding-top:120px' }, h('div', { class: 'big' }, '✦'), `${filtered().length} report${filtered().length === 1 ? '' : 's'} · select one to read it`))
    return
  }
  const p = r.payload, m = meta(r.id)
  const statusSel = h('select', { onchange: () => setMeta(r.id, { status: statusSel.value as Status }) }, ...STATUSES.map((s) => h('option', { value: s.id, selected: s.id === m.status }, s.label)))
  const tagInput = h('input', { type: 'text', placeholder: '+ tag', onkeydown: (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    const t = tagInput.value.trim().toLowerCase().replace(/[\s#,]+/g, '-')
    if (t && !m.tags.includes(t)) setMeta(r.id, { tags: [...m.tags, t] })
    else tagInput.value = ''
  } })

  const d = p.data
  const parts: (HTMLElement | null)[] = [
    h('div', { class: 'block' }, h('h3', {}, p.type === 'bug' ? 'What happened' : 'Feedback'), h('div', { class: 'text' }, p.message || '—')),
    p.expected ? h('div', { class: 'block' }, h('h3', {}, 'Expected'), h('div', { class: 'text' }, p.expected)) : null,
    p.screenshot && /^data:image\/(jpeg|png|webp);base64,/.test(p.screenshot)
      ? h('div', { class: 'block' }, h('h3', {}, 'Screenshot'), h('img', { class: 'shot-img', src: p.screenshot, alt: 'Screenshot', onclick: () => lightbox(p.screenshot!) }))
      : null,
    d.dom?.element ? h('div', { class: 'block' }, h('h3', {}, 'Pointed element'), kvTable({ selector: d.dom.element.selector, tag: d.dom.element.tag, text: d.dom.element.text, rect: d.dom.element.rect }), h('pre', { class: 'raw', style: 'margin-top:10px' }, d.dom.element.html)) : null,
    d.dom?.selection ? h('div', { class: 'block' }, h('h3', {}, 'Selected text'), h('div', { class: 'text' }, d.dom.selection)) : null,
    d.console ? collapsible('Console & errors', `${d.console.errors.length} errors · ${d.console.logs.length} logs`, consoleView(d.console), d.console.errors.length > 0) : null,
    d.basics ? collapsible('Browser & device', String((d.basics.userAgentData as { platform?: string } | undefined)?.platform ?? d.basics.platform ?? ''), kvTable(d.basics)) : null,
    d.storage ? collapsible('Storage', d.storage.valuesIncluded ? 'with values' : 'names only', kvTable(d.storage)) : null,
    collapsible('Raw JSON', '', h('pre', { class: 'raw' }, JSON.stringify({ ...p, screenshot: p.screenshot ? `[${Math.round(p.screenshot.length / 1024)} KB image]` : undefined }, null, 2))),
  ]

  detail.replaceChildren(h('div', { class: 'detail-inner' },
    h('button', { class: 'btn sm mobile-back', style: 'margin-bottom:12px', onclick: () => { selected = null; render() } }, '‹ Back'),
    h('div', { class: 'd-head' }, h('h2', {}, title(p)), h('span', { class: 'pill' }, p.type === 'bug' ? '🐞 Bug' : '💬 Feedback')),
    h('div', { class: 'd-actions' },
      statusSel,
      h('div', { class: 'tags-edit' }, ...m.tags.map((t) => h('span', { class: 'tag' }, '#' + t, h('button', { title: 'Remove tag', onclick: () => setMeta(r.id, { tags: m.tags.filter((x) => x !== t) }) }, '×'))), tagInput),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn sm', onclick: () => download(`report-${r.id.slice(0, 8)}.json`, JSON.stringify({ ...p, meta: m }, null, 2), 'application/json') }, 'Download'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        if (!confirm('Delete this report? It will be hidden on all your devices.')) return
        setMeta(r.id, { deleted: true })
        await db.deleteReport(r.id)
        reports = reports.filter((x) => x.id !== r.id)
        selected = null
        render()
      } }, 'Delete'),
    ),
    h('div', { class: 'meta' },
      metaCell('From', p.name || 'Anonymous'),
      metaCell('Project', p.project.name ? `${p.project.name} (${p.project.id})` : p.project.id),
      metaCell('Sent', new Date(p.createdAt).toLocaleString()),
      p.mood ? metaCell('Mood', { unhappy: '😞 Unhappy', neutral: '😐 Neutral', happy: '🙂 Happy', love: '😍 Love it' }[p.mood] ?? p.mood) : null,
      p.page ? h('div', { style: 'grid-column:1/-1' }, h('span', {}, 'Page'), safeLink(p.page.url), p.page.title ? h('div', { class: 'hint', style: 'margin:0' }, p.page.title) : null) : null,
      metaCell('Sender key (throw-away)', keys.encodeNpub(r.sender).slice(0, 20) + '…'),
    ),
    ...parts,
  ))
}

function metaCell(label: string, value: string) {
  return h('div', { title: value }, h('span', {}, label), value)
}

function safeLink(url: string) {
  return /^https?:\/\//i.test(url) ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'mono' }, url) : h('span', { class: 'mono' }, url)
}

function collapsible(label: string, info: string, content: HTMLElement, open = false) {
  return h('details', { class: 'block', open }, h('summary', {}, label, info ? h('span', { class: 'pill' }, info) : null), content)
}

function kvTable(obj: Record<string, unknown>) {
  return h('table', { class: 'kv' }, h('tbody', {}, ...Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) =>
    h('tr', {}, h('td', {}, k), h('td', {}, typeof v === 'object' ? h('pre', {}, JSON.stringify(v, null, 2)) : String(v))))))
}

function consoleView(c: NonNullable<ReportPayload['data']['console']>) {
  const row = (e: ConsoleEntry) => h('div', { class: `log ${e.level}` }, h('span', { class: 'tm' }, new Date(e.time).toLocaleTimeString()), h('span', { class: 'lv' }, e.level), h('span', {}, e.message))
  const all = [...c.errors, ...c.logs].sort((a, b) => a.time - b.time)
  return h('div', {},
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, `Captured since ${new Date(c.capturedSince).toLocaleString()}`),
    all.length ? h('div', { class: 'logs' }, ...all.map(row)) : h('p', { class: 'hint' }, 'No console output captured.'),
    c.failedResources.length ? h('div', { style: 'margin-top:10px' }, h('h3', {}, 'Failed resources'), h('pre', { class: 'raw' }, JSON.stringify(c.failedResources, null, 2))) : null,
  )
}

function lightbox(src: string) {
  const dlg = h('dialog', { class: 'lightbox', onclick: () => dlg.close(), onclose: () => dlg.remove() }, h('img', { src, alt: 'Screenshot' }))
  document.body.append(dlg)
  dlg.showModal()
}

// ---------------------------------------------------------------- export

function download(name: string, content: string, type: string) {
  const a = h('a', { href: URL.createObjectURL(new Blob([content], { type })), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function exportReports(kind: 'json' | 'csv') {
  const items = filtered()
  const stamp = new Date().toISOString().slice(0, 10)
  if (kind === 'json') return download(`feedbacklet-${stamp}.json`, JSON.stringify(items.map((r) => ({ ...r.payload, meta: meta(r.id) })), null, 2), 'application/json')
  const cols = ['id', 'type', 'status', 'tags', 'project', 'created', 'name', 'title', 'message', 'expected', 'mood', 'url', 'userAgent', 'errors', 'hasScreenshot']
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v)
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s
  }
  const rows = items.map((r) => {
    const p = r.payload, m = meta(r.id)
    return [p.id, p.type, m.status, m.tags.join(' '), p.project.id, new Date(p.createdAt).toISOString(), p.name, p.title, p.message, p.expected, p.mood, p.page?.url, p.data.basics?.userAgent, p.data.console?.errors.length, !!p.screenshot].map(esc).join(',')
  })
  download(`feedbacklet-${stamp}.csv`, [cols.join(','), ...rows].join('\r\n'), 'text/csv')
}

// ---------------------------------------------------------------- settings

function openSettings(welcome = false) {
  const npub = keys.encodeNpub(id.pubkey)
  const relaysTa = h('textarea', { rows: 4, spellcheck: 'false', class: 'mono' }, state.relays.join('\n'))
  const nsecBox = h('div', { class: 'mono', hidden: true })
  const msg = h('div')
  const newPass = h('input', { type: 'password', placeholder: 'New passphrase (min 8)', autocomplete: 'new-password' })
  const dlg = h('dialog', { onclose: () => dlg.remove() },
    h('div', { class: 'dlg-head' }, h('h3', {}, welcome ? 'Your admin key is ready 🎉' : 'Settings'), h('button', { class: 'btn sm', onclick: () => dlg.close() }, 'Close')),
    h('div', { class: 'dlg-body' },
      msg,
      h('section', {},
        h('h4', {}, 'Admin public key'),
        h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Put this in your bookmarklet. Anyone can know it — only you can decrypt.'),
        h('div', { class: 'mono', style: 'margin-bottom:10px' }, npub),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm', onclick: (e: Event) => copy(npub, e.currentTarget as HTMLElement) }, 'Copy npub'),
          h('a', { class: 'btn sm accent', href: `./generator.html#admin=${npub}` }, 'Create a bookmarklet →'),
        ),
      ),
      h('section', {},
        h('h4', {}, 'Backup'),
        h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'If you lose this key, all reports sent to it are unreadable. Keep a backup somewhere safe.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm', onclick: () => download(`feedbacklet-admin-${npub.slice(5, 13)}.ncryptsec.txt`, `${keys.storedIdentity()!.ncryptsec}\n\n# ${npub}\n# Encrypted with your passphrase (NIP-49). Import it in the Feedbacklet admin inbox.\n`, 'text/plain') }, 'Download encrypted backup'),
          h('button', { class: 'btn sm', onclick: (e: Event) => {
            nsecBox.hidden = !nsecBox.hidden
            nsecBox.textContent = nsecBox.hidden ? '' : keys.encodeNsec(id.sk)
            ;(e.currentTarget as HTMLElement).textContent = nsecBox.hidden ? 'Reveal nsec' : 'Hide nsec'
          } }, 'Reveal nsec'),
        ),
        h('div', { style: 'margin-top:10px' }, nsecBox),
      ),
      welcome ? null : h('section', {},
        h('h4', {}, 'Relays'),
        h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'One per line. Should include the relays configured in your bookmarklets.'),
        relaysTa,
        h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { class: 'btn sm primary', onclick: () => {
          const rl = relaysTa.value.split(/\s+/).map((s) => s.trim()).filter((s) => /^wss?:\/\/.+/.test(s))
          if (!rl.length) return void (msg.replaceChildren(h('div', { class: 'error-box' }, 'Enter at least one wss:// relay.')))
          state.relays = rl
          state.relaysUpdatedAt = Date.now()
          persistState()
          msg.replaceChildren(h('div', { class: 'ok-box' }, 'Relays saved. Reconnecting…'))
          connect()
        } }, 'Save relays')),
      ),
      welcome ? null : h('section', {},
        h('h4', {}, 'Change passphrase'),
        h('div', { class: 'row' }, newPass, h('button', { class: 'btn sm', style: 'flex:none', onclick: () => {
          if (newPass.value.length < 8) return void msg.replaceChildren(h('div', { class: 'error-box' }, 'Passphrase must be at least 8 characters.'))
          keys.changePassphrase(id, newPass.value)
          newPass.value = ''
          msg.replaceChildren(h('div', { class: 'ok-box' }, 'Passphrase changed. Download a fresh backup.'))
        } }, 'Change')),
      ),
      welcome ? null : h('section', {},
        h('h4', {}, 'Danger zone'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm', onclick: async () => {
            if (!confirm('Clear the local report cache and re-download everything from relays?')) return
            await db.clear()
            reports = []
            render()
            connect()
            dlg.close()
          } }, 'Re-sync from relays'),
          h('button', { class: 'btn sm danger', onclick: () => {
            if (!confirm('Remove the admin key from this browser? Without a backup you lose access to all reports.')) return
            keys.forget()
            location.reload()
          } }, 'Remove key from this browser'),
        ),
      ),
    ),
  )
  document.body.append(dlg)
  dlg.showModal()
}

// ---------------------------------------------------------------- boot

const session = keys.sessionIdentity()
if (session) start(session)
else renderLock()
