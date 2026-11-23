import { defineConfig,loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { mobileConfig } from './src/account/config.ts'
export default defineConfig(({ command,mode }) => {
 const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env}
 const config=mobileConfig(env,false)
 const origins=config?[config.apiOrigin,config.supabaseUrl,config.supabaseUrl.replace(/^https:/,'wss:').replace(/^http:/,'ws:')].filter((s,i,a)=>a.indexOf(s)===i).join(' '):''
 return {
  plugins: [react(), {
    name: 'local-development-csp',
    transformIndexHtml(html) {
      // HMR needs inline preamble/styles, but the bundled release does not.
      const secured=html.replace("connect-src 'self'",`connect-src 'self' ${origins}`)
      return command === 'serve' ? secured.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("style-src 'self'", "style-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:3173") : secured
    },
  }],
  base: './',
  publicDir: fileURLToPath(new URL('../../public/design/founder', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
 }})
