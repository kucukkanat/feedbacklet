import type { PickedElement } from '../shared/protocol'

function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node.nodeType === 1 && parts.length < 8) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift(`#${node.id}`)
      break
    }
    let part = node.tagName.toLowerCase()
    const cls = Array.from(node.classList).filter((c) => /^[A-Za-z_][\w-]*$/.test(c)).slice(0, 2)
    if (cls.length) part += '.' + cls.join('.')
    const parent: Element | null = node.parentElement
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

export function describeElement(el: Element): PickedElement {
  const r = el.getBoundingClientRect()
  return {
    selector: cssPath(el),
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300),
    rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    html: el.outerHTML.slice(0, 2000),
  }
}

/** Lets the user hover + click an element on the host page. Esc cancels. */
export function pickElement(host: HTMLElement): Promise<Element | null> {
  return new Promise((resolve) => {
    const box = document.createElement('div')
    box.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,.12);border-radius:3px;transition:all .05s;display:none'
    const hint = document.createElement('div')
    hint.textContent = 'Click the element with the problem · Esc to cancel'
    hint.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111827;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:999px;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.2)'
    document.documentElement.append(box, hint)
    let current: Element | null = null

    const move = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || el === host || el === box || el === hint) return
      current = el
      const r = el.getBoundingClientRect()
      Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
    }
    const stop = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const click = (e: MouseEvent) => {
      stop(e)
      done(current)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stop(e)
        done(null)
      }
    }
    function done(el: Element | null) {
      document.removeEventListener('mousemove', move, true)
      document.removeEventListener('click', click, true)
      document.removeEventListener('mousedown', stop, true)
      document.removeEventListener('mouseup', stop, true)
      document.removeEventListener('keydown', key, true)
      box.remove()
      hint.remove()
      resolve(el)
    }
    document.addEventListener('mousemove', move, true)
    document.addEventListener('click', click, true)
    document.addEventListener('mousedown', stop, true)
    document.addEventListener('mouseup', stop, true)
    document.addEventListener('keydown', key, true)
  })
}
