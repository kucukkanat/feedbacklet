import { h } from '../shared/dom'

export const REPO_URL = 'https://github.com/kucukkanat/feedbacklet'

export function mountNav(current: 'home' | 'generator' | 'admin') {
  const link = (href: string, label: string, id: string, cls = '') =>
    h('a', { href, class: cls, 'aria-current': current === id ? 'page' : undefined }, label)
  document.body.prepend(
    h('nav', { class: 'nav' },
      h('div', { class: 'nav-inner' },
        h('a', { class: 'brand', href: './' }, h('span', { class: 'brand-mark' }, '✦'), 'Feedbacklet'),
        h('div', { class: 'nav-links' },
          link('./', 'Overview', 'home', 'hide-sm'),
          link('./generator.html', 'Create bookmarklet', 'generator'),
          link('./admin.html', 'Admin inbox', 'admin'),
          h('a', { href: REPO_URL, class: 'hide-sm', target: '_blank', rel: 'noopener' }, 'GitHub'),
        ),
      ),
    ),
  )
}

export async function copy(text: string, btn?: HTMLElement) {
  await navigator.clipboard.writeText(text)
  if (btn) {
    const prev = btn.textContent
    btn.textContent = 'Copied ✓'
    setTimeout(() => (btn.textContent = prev), 1400)
  }
}

/** URL of the hosted widget script next to the current page. */
export const widgetUrl = () => new URL('feedbacklet.js', location.href).href
