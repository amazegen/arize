import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'local-development-csp',
    transformIndexHtml(html) {
      // HMR needs inline preamble/styles, but the bundled release does not.
      return command === 'serve' ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("style-src 'self'", "style-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:3173") : html
    },
  }],
  base: './',
  publicDir: fileURLToPath(new URL('../../public/design/founder', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
}))
