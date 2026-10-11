import { validateConfig, type WidgetConfig } from '../shared/config'
import { installConsoleCapture } from './console'
import { FeedbackModal } from './ui'

declare global {
  interface Window {
    __FEEDBACKLET_CONFIG__?: Partial<WidgetConfig>
    Feedbacklet?: { open: (cfg?: Partial<WidgetConfig>) => void; close: () => void }
  }
}

installConsoleCapture()

let modal: FeedbackModal | undefined
let current: WidgetConfig | undefined

export function open(cfg?: Partial<WidgetConfig>) {
  try {
    if (cfg || !current) current = validateConfig(cfg ?? window.__FEEDBACKLET_CONFIG__)
  } catch (err) {
    alert('Feedbacklet: ' + (err as Error).message)
    return
  }
  if (!modal) modal = new FeedbackModal(current)
  else modal.setConfig(current)
  modal.open()
}

export function close() {
  modal?.close()
}

if (typeof window !== 'undefined' && !window.Feedbacklet) {
  window.Feedbacklet = { open, close }
  const initial = window.__FEEDBACKLET_CONFIG__
  if (initial && initial.autoOpen !== false) open(initial)
}
