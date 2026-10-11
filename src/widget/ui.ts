import type { WidgetConfig } from '../shared/config'
import { PROTOCOL_VERSION, randomId, type PickedElement, type ReportPayload, type ReportType } from '../shared/protocol'
import { collectBasics, collectStorage, currentSelection } from './collect'
import { getConsoleData } from './console'
import { describeElement, pickElement } from './picker'
import { captureViewport } from './screenshot'
import { sendReport } from './send'
import { css } from './styles'
import { h, svgIcon } from '../shared/dom'

const LOCK = () => svgIcon('<path fill="none" stroke="currentColor" stroke-width="2" d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"/>', 'lock')

interface BugState {
  basics: boolean
  console: boolean
  storage: boolean
  storageValues: boolean
  selection: boolean
  screenshot: boolean
  element?: PickedElement
  elementRect?: DOMRect
  shot?: string
  selectionText?: string
  basicsData?: Record<string, unknown>
}

export class FeedbackModal {
  private host: HTMLElement
  private root: ShadowRoot
  private backdrop: HTMLDivElement
  private modal: HTMLDivElement
  private cfg: WidgetConfig
  private draft = { name: '', message: '', title: '', expected: '', mood: '', page: true }
  private bug: BugState = { basics: true, console: true, storage: true, storageValues: false, selection: true, screenshot: false }

  constructor(cfg: WidgetConfig) {
    this.cfg = cfg
    this.host = h('div', { 'data-feedbacklet': '' })
    this.root = this.host.attachShadow({ mode: 'open' })
    this.root.append(h('style', {}, css(cfg.accent || '#2563eb')))
    this.modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' })
    this.backdrop = h('div', { class: 'backdrop hidden', onclick: (e: Event) => e.target === this.backdrop && this.close() }, this.modal)
    this.root.append(this.backdrop)
    this.root.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Escape' && this.close())
    document.documentElement.append(this.host)
  }

  setConfig(cfg: WidgetConfig) {
    this.cfg = cfg
  }

  open() {
    this.bug.selectionText = currentSelection() ?? this.bug.selectionText
    this.backdrop.classList.remove('hidden')
    this.renderChoose()
  }

  close() {
    this.backdrop.classList.add('hidden')
  }

  private frame(title: string, body: Node, back?: () => void) {
    this.modal.replaceChildren(
      h('header', {},
        back ? h('button', { class: 'icon-btn', title: 'Back', onclick: back }, '‹') : null,
        h('h2', {}, title),
        h('button', { class: 'icon-btn', title: 'Close', 'aria-label': 'Close', onclick: () => this.close() }, '×'),
      ),
      h('div', { class: 'body' }, body),
    )
    ;(this.modal.querySelector('textarea, input[type=text]') as HTMLElement | null)?.focus()
  }

  private renderChoose() {
    const project = this.cfg.project.name || this.cfg.project.id
    this.frame(
      this.cfg.title || `Help us improve ${project}`,
      h('div', {},
        h('div', { class: 'choices' },
          h('button', { class: 'choice', onclick: () => this.renderFeedback() },
            h('span', { class: 'emoji' }, '💬'), h('b', {}, 'Give feedback'), h('span', {}, 'Ideas, praise, suggestions')),
          h('button', { class: 'choice', onclick: () => this.renderBug() },
            h('span', { class: 'emoji' }, '🐞'), h('b', {}, 'Report a bug'), h('span', {}, 'Something broken or confusing')),
        ),
        h('p', { class: 'muted', style: 'display:flex;gap:6px;align-items:center;margin:14px 0 0' }, LOCK(),
          'End-to-end encrypted. Only the team behind this app can read it.'),
      ),
    )
  }

  private input(key: 'name' | 'title', label: string, placeholder: string, optional = true) {
    return h('label', { class: 'field' },
      h('span', {}, label, optional ? h('em', {}, ' · optional') : null),
      h('input', { type: 'text', value: this.draft[key], placeholder, maxlength: 120, oninput: (e: Event) => (this.draft[key] = (e.target as HTMLInputElement).value) }),
    )
  }

  private textarea(key: 'message' | 'expected', label: string, placeholder: string, optional = false) {
    return h('label', { class: 'field' },
      h('span', {}, label, optional ? h('em', {}, ' · optional') : null),
      h('textarea', { placeholder, maxlength: 5000, oninput: (e: Event) => (this.draft[key] = (e.target as HTMLTextAreaElement).value) }, this.draft[key]),
    )
  }

  private footer(type: ReportType) {
    return h('div', { class: 'footer' },
      h('span', { class: 'muted' }, LOCK(), 'Sent anonymously'),
      h('button', { class: 'btn primary', onclick: () => this.submit(type) }, 'Send'),
    )
  }

  private renderFeedback(error?: string) {
    const moods: [string, string][] = [['😞', 'unhappy'], ['😐', 'neutral'], ['🙂', 'happy'], ['😍', 'love']]
    const moodRow = h('div', { class: 'moods' },
      ...moods.map(([emoji, value]) =>
        h('button', { class: 'mood', title: value, 'aria-pressed': String(this.draft.mood === value), onclick: (e: Event) => {
          this.draft.mood = this.draft.mood === value ? '' : value
          moodRow.querySelectorAll('.mood').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget && !!this.draft.mood)))
        } }, emoji)))
    this.frame('Give feedback',
      h('div', {},
        error ? h('div', { class: 'error' }, error) : null,
        moodRow,
        this.textarea('message', 'Your feedback', 'What do you like? What could be better?'),
        this.input('name', 'Your name', 'Anonymous'),
        h('div', { class: 'opt-row', style: 'margin-bottom:14px' },
          h('input', { type: 'checkbox', id: 'pg', checked: this.draft.page, onchange: (e: Event) => (this.draft.page = (e.target as HTMLInputElement).checked) }),
          h('label', { for: 'pg' }, 'Include the page address', h('small', {}, location.href.slice(0, 90))),
        ),
        this.footer('feedback'),
      ),
      () => this.renderChoose(),
    )
  }

  private option(key: keyof BugState, label: string, hint: string, preview?: () => unknown | Promise<unknown>, extra?: Node | null) {
    const pre = h('pre', { hidden: true })
    const toggle = preview
      ? h('button', { class: 'link', onclick: async () => {
          if (pre.hidden) pre.textContent = JSON.stringify(await preview(), null, 2)
          pre.hidden = !pre.hidden
          toggle!.textContent = pre.hidden ? 'Preview' : 'Hide'
        } }, 'Preview')
      : null
    const id = 'opt-' + key
    return h('div', { class: 'opt' },
      h('div', { class: 'opt-row' },
        h('input', { type: 'checkbox', id, checked: !!this.bug[key], onchange: (e: Event) => ((this.bug as unknown as Record<string, unknown>)[key] = (e.target as HTMLInputElement).checked) }),
        h('label', { for: id }, label, h('small', {}, hint)),
        toggle,
      ),
      extra ?? null,
      pre,
    )
  }

  private renderBug(error?: string) {
    const b = this.bug
    const consoleData = getConsoleData()
    const since = new Date(consoleData.capturedSince).toLocaleTimeString()

    const storageSub = h('label', { class: 'sub' },
      h('input', { type: 'checkbox', checked: b.storageValues, onchange: (e: Event) => (b.storageValues = (e.target as HTMLInputElement).checked) }),
      'Also include values (may contain tokens or personal data)')

    const elementBox = h('div', { class: 'opt' })
    const renderElement = () => {
      elementBox.replaceChildren(
        h('div', { class: 'opt-row' },
          h('label', {}, 'Point at the problem', h('small', {}, b.element ? 'Element selected:' : 'Optionally click the element that misbehaves')),
          b.element ? h('button', { class: 'link', onclick: () => { b.element = undefined; b.elementRect = undefined; renderElement() } }, 'Remove') : null,
          h('button', { class: 'link', onclick: () => this.pick(renderElement) }, b.element ? 'Re-pick' : 'Pick element'),
        ),
        b.element ? h('div', { class: 'chip', title: b.element.selector }, b.element.selector) : '',
      )
    }
    renderElement()

    const shotBox = h('div', { class: 'shot' })
    const renderShot = () => {
      shotBox.replaceChildren(b.screenshot && b.shot ? h('img', { src: b.shot, alt: 'Screenshot preview' }) : '')
    }
    renderShot()
    const shotOpt = h('div', { class: 'opt' },
      h('div', { class: 'opt-row' },
        h('input', { type: 'checkbox', id: 'opt-shot', checked: b.screenshot, onchange: async (e: Event) => {
          b.screenshot = (e.target as HTMLInputElement).checked
          if (b.screenshot && !b.shot) await this.takeShot(shotBox)
          renderShot()
        } }),
        h('label', { for: 'opt-shot' }, 'Attach a screenshot', h('small', {}, 'Of the visible part of the page, without this window')),
        h('button', { class: 'link', onclick: async () => { b.screenshot = true; (shotOpt.querySelector('#opt-shot') as HTMLInputElement).checked = true; await this.takeShot(shotBox); renderShot() } }, 'Retake'),
      ),
      shotBox,
    )

    this.frame('Report a bug',
      h('div', {},
        error ? h('div', { class: 'error' }, error) : null,
        this.input('title', 'Summary', 'e.g. “Save button does nothing”'),
        this.textarea('message', 'What happened?', 'Steps to reproduce, what you saw…'),
        this.textarea('expected', 'What did you expect?', '', true),
        this.input('name', 'Your name', 'Anonymous'),
        h('fieldset', {},
          h('legend', {}, 'Include with report'),
          shotOpt,
          elementBox,
          this.option('basics', 'Browser & device info', 'Page URL, browser, screen, language, timezone, performance', async () => (b.basicsData ??= await collectBasics())),
          this.option('console', 'Console logs & errors', `${consoleData.logs.length} logs, ${consoleData.errors.length} errors captured since ${since}`, () => getConsoleData()),
          this.option('storage', 'Storage & cookie names', 'Names and sizes of localStorage, sessionStorage and cookies', () => collectStorage(b.storageValues), storageSub),
          b.selectionText ? this.option('selection', 'Selected text', `“${b.selectionText.slice(0, 60)}${b.selectionText.length > 60 ? '…' : ''}”`) : null,
        ),
        this.footer('bug'),
      ),
      () => this.renderChoose(),
    )
  }

  private async pick(after: () => void) {
    this.backdrop.classList.add('hidden')
    const el = await pickElement(this.host)
    this.backdrop.classList.remove('hidden')
    if (el) {
      this.bug.element = describeElement(el)
      this.bug.elementRect = el.getBoundingClientRect()
      if (this.bug.screenshot) this.bug.shot = undefined // retake with highlight on send
    }
    after()
  }

  private async takeShot(box: HTMLElement) {
    box.replaceChildren(h('p', { class: 'muted' }, 'Capturing…'))
    this.backdrop.classList.add('hidden')
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))
    try {
      this.bug.shot = await captureViewport(this.host, this.bug.elementRect)
    } catch (err) {
      this.bug.shot = undefined
      this.bug.screenshot = false
      box.replaceChildren(h('p', { class: 'error' }, 'Screenshot failed: ' + (err as Error).message))
    } finally {
      this.backdrop.classList.remove('hidden')
    }
  }

  private async buildPayload(type: ReportType): Promise<ReportPayload> {
    const d = this.draft
    const p: ReportPayload = {
      v: PROTOCOL_VERSION,
      id: randomId(),
      type,
      project: this.cfg.project,
      createdAt: Date.now(),
      name: d.name.trim() || undefined,
      message: d.message.trim(),
      data: {},
    }
    if (type === 'feedback') {
      if (d.mood) p.mood = d.mood
      if (d.page) p.page = { url: location.href, title: document.title }
      return p
    }
    const b = this.bug
    p.title = d.title.trim() || undefined
    p.expected = d.expected.trim() || undefined
    if (b.basics) {
      p.page = { url: location.href, title: document.title }
      p.data.basics = await collectBasics()
    }
    if (b.console) p.data.console = getConsoleData()
    if (b.storage) p.data.storage = collectStorage(b.storageValues)
    const sel = b.selection ? b.selectionText : undefined
    if (sel || b.element) p.data.dom = { selection: sel, element: b.element }
    if (b.screenshot) {
      if (!b.shot) {
        this.backdrop.classList.add('hidden')
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))
        try {
          b.shot = await captureViewport(this.host, b.elementRect)
        } finally {
          this.backdrop.classList.remove('hidden')
        }
      }
      p.screenshot = b.shot
    }
    return p
  }

  private async submit(type: ReportType) {
    const rerender = (err?: string) => (type === 'bug' ? this.renderBug(err) : this.renderFeedback(err))
    if (!this.draft.message.trim()) return rerender(type === 'bug' ? 'Please describe what happened.' : 'Please write a few words of feedback.')

    let payload: ReportPayload
    try {
      payload = await this.buildPayload(type)
    } catch (err) {
      return rerender('Could not collect report data: ' + (err as Error).message)
    }
    const bar = h('div')
    const status = h('p', { class: 'muted' }, 'Encrypting…')
    this.frame('Sending', h('div', { class: 'center' }, h('div', { class: 'big' }, '🔐'), h('h3', {}, 'Encrypting & sending'), h('div', { class: 'progress' }, bar), status))
    try {
      const res = await sendReport(this.cfg, payload, (done, total) => {
        bar.style.width = `${Math.round((done / total) * 100)}%`
        status.textContent = `Delivering to ${this.cfg.relays.length} relay${this.cfg.relays.length > 1 ? 's' : ''}…`
      })
      this.reset()
      this.frame('Thank you!',
        h('div', { class: 'center' },
          h('div', { class: 'big' }, '✅'),
          h('h3', {}, type === 'bug' ? 'Bug report sent' : 'Feedback sent'),
          h('p', { class: 'muted' }, `Delivered to ${res.relaysOk.length}/${this.cfg.relays.length} relays${res.relaysFailed.length ? ` (failed: ${res.relaysFailed.map((r) => new URL(r).host).join(', ')})` : ''}.`),
          h('button', { class: 'btn ghost', onclick: () => this.close() }, 'Close'),
        ))
    } catch (err) {
      rerender((err as Error).message)
    }
  }

  private reset() {
    this.draft = { name: this.draft.name, message: '', title: '', expected: '', mood: '', page: true }
    this.bug = { basics: true, console: true, storage: true, storageValues: false, selection: true, screenshot: false }
  }
}
