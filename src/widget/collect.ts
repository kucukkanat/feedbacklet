// Browser information collectors. Each returns plain JSON so the reporter can preview
// exactly what will be sent before opting in or out.

type Json = Record<string, unknown>

export async function collectBasics(): Promise<Json> {
  const n = navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(h: string[]): Promise<Json> }
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
    deviceMemory?: number
  }
  let uaData: Json | undefined
  try {
    uaData = await n.userAgentData?.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'model', 'fullVersionList', 'mobile'])
  } catch {
    /* not supported */
  }
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  const mq = (q: string) => matchMedia(q).matches
  return {
    url: location.href,
    referrer: document.referrer || undefined,
    title: document.title,
    userAgent: n.userAgent,
    userAgentData: uaData,
    platform: n.platform,
    language: n.language,
    languages: n.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    localTime: new Date().toString(),
    screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, colorDepth: screen.colorDepth, orientation: screen.orientation?.type },
    viewport: { width: innerWidth, height: innerHeight, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY), devicePixelRatio },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, readyState: document.readyState, visibility: document.visibilityState, charset: document.characterSet, compatMode: document.compatMode },
    preferences: {
      colorScheme: mq('(prefers-color-scheme: dark)') ? 'dark' : 'light',
      reducedMotion: mq('(prefers-reduced-motion: reduce)'),
      contrast: mq('(prefers-contrast: more)') ? 'more' : 'no-preference',
      pointer: mq('(pointer: coarse)') ? 'coarse' : 'fine',
    },
    hardware: { cores: n.hardwareConcurrency, deviceMemoryGB: n.deviceMemory, maxTouchPoints: n.maxTouchPoints },
    network: { online: n.onLine, ...(n.connection ? { effectiveType: n.connection.effectiveType, downlink: n.connection.downlink, rtt: n.connection.rtt, saveData: n.connection.saveData } : {}) },
    cookieEnabled: n.cookieEnabled,
    doNotTrack: n.doNotTrack,
    historyLength: history.length,
    performance: nav
      ? {
          type: nav.type,
          ttfbMs: Math.round(nav.responseStart - nav.requestStart),
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadMs: Math.round(nav.loadEventEnd),
          transferSize: nav.transferSize,
          resources: performance.getEntriesByType('resource').length,
          timeOnPageS: Math.round(performance.now() / 1000),
        }
      : undefined,
    memory: mem ? { usedMB: +(mem.usedJSHeapSize / 1048576).toFixed(1), totalMB: +(mem.totalJSHeapSize / 1048576).toFixed(1), limitMB: +(mem.jsHeapSizeLimit / 1048576).toFixed(1) } : undefined,
  }
}

function describeStorage(s: Storage | undefined, withValues: boolean) {
  if (!s) return undefined
  const out: Record<string, unknown> = {}
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!
      const v = s.getItem(k) ?? ''
      out[k] = withValues ? v.slice(0, 2000) : `${v.length} chars`
    }
  } catch {
    return 'inaccessible'
  }
  return out
}

export function collectStorage(withValues: boolean): Json {
  let ls: Storage | undefined, ss: Storage | undefined
  try { ls = localStorage } catch { /* blocked */ }
  try { ss = sessionStorage } catch { /* blocked */ }
  const cookies: Record<string, string> = {}
  for (const part of document.cookie ? document.cookie.split(/;\s*/) : []) {
    const i = part.indexOf('=')
    const k = i < 0 ? part : part.slice(0, i)
    const v = i < 0 ? '' : part.slice(i + 1)
    cookies[k] = withValues ? v.slice(0, 2000) : `${v.length} chars`
  }
  return { valuesIncluded: withValues, localStorage: describeStorage(ls, withValues), sessionStorage: describeStorage(ss, withValues), cookies }
}

export function currentSelection(): string | undefined {
  const s = window.getSelection()?.toString().trim()
  return s ? s.slice(0, 2000) : undefined
}
