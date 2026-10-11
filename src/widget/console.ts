import type { ConsoleEntry } from '../shared/protocol'

// Console / error capture. A bookmarklet can only observe what happens after it is
// first injected, so this is installed as early as possible and kept for the page life.

const MAX_LOGS = 300
const MAX_LEN = 2000
const logs: ConsoleEntry[] = []
const errors: ConsoleEntry[] = []
let installedAt = 0

function stringify(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack : ''}`
  try {
    const seen = new WeakSet()
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
        if (val instanceof Node) return `<${(val as Element).tagName?.toLowerCase() ?? val.nodeName}>`
      }
      if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`
      if (typeof val === 'bigint') return val.toString() + 'n'
      return val
    })
  } catch {
    return String(v)
  }
}

function push(list: ConsoleEntry[], level: string, args: unknown[]) {
  const message = args.map(stringify).join(' ').slice(0, MAX_LEN)
  list.push({ level, time: Date.now(), message })
  if (list.length > MAX_LOGS) list.shift()
}

export function installConsoleCapture() {
  if (installedAt) return
  installedAt = Date.now()
  const c = console as unknown as Record<string, (...a: unknown[]) => void>
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = c[level]
    if (typeof orig !== 'function') continue
    c[level] = function (...args: unknown[]) {
      try {
        push(logs, level, args)
      } catch {
        /* never break the host page */
      }
      return orig.apply(console, args)
    }
  }
  window.addEventListener(
    'error',
    (e) => {
      const t = e.target as Element | null
      if (t && t !== (window as unknown) && 'tagName' in t) {
        const src = (t as HTMLImageElement).src || (t as HTMLLinkElement).href || ''
        push(errors, 'resource', [`Failed to load <${t.tagName.toLowerCase()}> ${src}`])
      } else {
        push(errors, 'error', [`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, e.error ?? ''])
      }
    },
    true,
  )
  window.addEventListener('unhandledrejection', (e) => push(errors, 'unhandledrejection', [e.reason]))
}

export function getConsoleData() {
  const failedResources = performance
    .getEntriesByType('resource')
    .filter((r) => {
      const s = (r as PerformanceResourceTiming & { responseStatus?: number }).responseStatus
      return typeof s === 'number' && s >= 400
    })
    .map((r) => ({ name: r.name, status: (r as PerformanceResourceTiming & { responseStatus?: number }).responseStatus }))
  return { logs: [...logs], errors: [...errors], failedResources, capturedSince: installedAt }
}
