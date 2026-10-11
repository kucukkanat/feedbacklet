import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        generator: resolve(import.meta.dirname, 'generator.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
})
