import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'

// Host pages may not declare UTF-8, so the injected script must be pure ASCII.
const asciiOnly = (): Plugin => ({
  name: 'ascii-only',
  generateBundle(_opts, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk') {
        chunk.code = chunk.code.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      }
    }
  },
})

// Builds the injectable widget as a single self-contained IIFE: dist/feedbacklet.js
export default defineConfig({
  publicDir: false,
  plugins: [asciiOnly()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/widget/index.ts'),
      name: 'Feedbacklet',
      formats: ['iife'],
      fileName: () => 'feedbacklet.js',
    },
  },
})
