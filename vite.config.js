import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@components': fileURLToPath(new URL('src/components', import.meta.url)),
      '@services':   fileURLToPath(new URL('src/services',   import.meta.url)),
      '@data':       fileURLToPath(new URL('src/data',       import.meta.url)),
      '@utils':      fileURLToPath(new URL('src/utils',      import.meta.url)),
      '@styles':     fileURLToPath(new URL('src/styles',     import.meta.url)),
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**', 'src/utils/**', 'src/data/**'],
    },
  },
})
