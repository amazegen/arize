import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('web upload exclusions are root-scoped and preserve Supabase runtime clients', () => {
  const rules = readFileSync('.vercelignore', 'utf8').split(/\r?\n/)
    .map(rule => rule.trim()).filter(rule => rule && !rule.startsWith('#'))
  for (const directory of ['supabase', 'scripts', 'tests', 'docs', 'design', 'apps/mobile']) {
    assert.ok(rules.includes(`/${directory}`), `root exclusion missing: ${directory}`)
    assert.ok(!rules.includes(directory), `unanchored exclusion can omit runtime code: ${directory}`)
  }
  for (const file of ['lib/supabase/client.ts', 'lib/supabase/server.ts', 'lib/supabase/admin.ts']) {
    assert.ok(existsSync(file), `runtime source missing: ${file}`)
    assert.ok(!rules.some(rule => !rule.startsWith('!') &&
      (rule === file || (rule.startsWith('/') && file.startsWith(`${rule.slice(1)}/`)))))
  }
  assert.ok(rules.includes('.env') && rules.includes('.env.*'))
})
