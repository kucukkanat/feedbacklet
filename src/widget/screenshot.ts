import html2canvas from 'html2canvas-pro'

const MAX_WIDTH = 1600

/** Renders the visible viewport (excluding the widget) to a compressed JPEG data URL. */
export async function captureViewport(exclude: Element, highlight?: DOMRect): Promise<string> {
  const canvas = await html2canvas(document.documentElement, {
    x: scrollX,
    y: scrollY,
    width: innerWidth,
    height: innerHeight,
    windowWidth: document.documentElement.clientWidth,
    windowHeight: innerHeight,
    scale: Math.min(devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
    ignoreElements: (el) => el === exclude,
  })
  const ratio = Math.min(1, MAX_WIDTH / canvas.width)
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * ratio)
  out.height = Math.round(canvas.height * ratio)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  if (highlight) {
    const k = out.width / innerWidth
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = Math.max(2, 3 * k)
    ctx.strokeRect(highlight.x * k, highlight.y * k, highlight.width * k, highlight.height * k)
  }
  return out.toDataURL('image/jpeg', 0.72)
}
