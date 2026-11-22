import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  { files: ['apps/mobile/**/*.tsx'], rules: { '@next/next/no-img-element': 'off' } },
  globalIgnores(['.next/**', 'node_modules/**', 'apps/mobile/node_modules/**', 'apps/mobile/dist/**', 'apps/mobile/ios/**']),
])
