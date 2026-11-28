import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const postcss = require('postcss')
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('light-theme selectors stay inside the adult namespace', () => {
  for (const path of ['app/adult.css', 'styles/arize-theme.css']) {
    postcss.parse(read(path)).walkRules((rule: { selector: string; parent: { type: string; name?: string } }) => {
      if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return
      for (const selector of rule.selector.split(',')) assert.match(selector.trim(), /^\.adult-/, `${path}: ${selector}`)
    })
  }
  const tokens = read('styles/arize-theme.css')
  for (const role of ['ink', 'muted', 'cream', 'green', 'yellow', 'orange', 'surface', 'border']) assert.ok(tokens.includes(`--${role}:`))
  assert.match(tokens, /color-scheme: light/)
  assert.doesNotMatch(read('app/adult.css'), /\.student-|\bbody\b|:root/)
})

test('downloaded Figma assets are local, inert SVGs with native geometry', () => {
  const dimensions: Record<string, number> = { 'sun.svg': 24, 'sun-ring-outer.svg': 220, 'sun-ring-middle.svg': 164, 'sun-ring-inner.svg': 112 }
  const files = readdirSync(new URL('../public/design/arize/', import.meta.url))
  assert.equal(files.length, 11)
  for (const file of files) {
    const svg = read(`public/design/arize/${file}`)
    const size = dimensions[file] ?? 22
    assert.match(svg, new RegExp(`<svg[^>]*width="${size}"[^>]*height="${size}"`))
    assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+=|(?:href|src)=|url\(https?:/i)
  }
  const home = read('app/(app)/home/page.tsx')
  for (const size of [220, 164, 112]) assert.ok(home.includes(`width={${size}} height={${size}}`))
  assert.doesNotMatch(home, /https:\/\/www\.figma\.com\/api|data:image/)
})

test('adult navigation retains all six workflows and accessible route state', () => {
  const nav = read('components/nav/BottomNav.tsx')
  for (const route of ['/home', '/reset', '/goals', '/coach', '/village', '/settings']) assert.ok(nav.includes(`href: '${route}'`))
  assert.match(nav, /label: 'Reflect'/)
  assert.match(nav, /aria-current=/)
  assert.doesNotMatch(nav, /\/student/)
  const layout = read('app/(app)/layout.tsx')
  for (const preserved of ['AccessProvider', 'account_deletion_jobs', '/consent']) assert.ok(layout.includes(preserved), preserved)
})

test('chat viewport and composer reserve mobile navigation space without extra page scroll', () => {
  const css = read('app/adult.css')
  assert.match(css, /\.adult-main:has\(\.adult-chat\)[^}]*padding-bottom: var\(--adult-nav-height\)/)
  assert.match(css, /height: calc\(100dvh - var\(--adult-header-height\) - var\(--adult-nav-height\)\)/)
  assert.match(css, /prefers-reduced-motion/)
  const chat = read('app/(app)/coach/page.tsx')
  for (const existing of ['openConversation', 'startNewConversation', 'historyOpen', 'aria-label="Message Clarity"', 'role="log"']) assert.ok(chat.includes(existing))
  assert.ok(chat.includes('!conversationId && messages.length <= 1'))
  assert.match(read('app/(app)/village/[roomId]/page.tsx'), /aria-label="Send message"/)
})

test('Village unsubscribes on exit and stops stale room initialization', () => {
  const room = read('app/(app)/village/[roomId]/page.tsx')
  assert.match(room, /if \(cancelled\) return/)
  assert.match(room, /cancelled = true/)
  assert.match(room, /supabase\.removeChannel\(channel\)/)
  assert.match(room, /if \(!isMember \|\| !canReadRoom\) return/)
  assert.match(room, /const isMember = membershipRoomId === roomId/)
  assert.match(room, /active && payload\.new\.id/)
  // Re-fetch the unique RLS-filtered set (including signed media), never append raw realtime payloads.
  assert.match(room, /if\(version!==messageLoadVersion\.current\)return/)
  assert.match(room, /setMessages\(safe\)/)
})

test('completed goals and auth controls remain identifiable without color alone', () => {
  const goals = read('app/(app)/goals/page.tsx')
  assert.match(goals, /data-complete=\{goal.is_complete\}/)
  assert.match(goals, /aria-pressed=\{goal.is_complete\}/)
  assert.ok(goals.includes("'Complete goal'"))
  for (const page of ['sign-in', 'sign-up']) {
    const source = read(`app/(auth)/${page}/page.tsx`)
    for (const field of ['email', 'password']) {
      assert.ok(source.includes(`htmlFor="${page}-${field}"`))
      assert.ok(source.includes(`id="${page}-${field}"`))
    }
    assert.match(source, /'Hide password' : 'Show password'/)
  }
})

test('principal text and action colors meet WCAG AA normal-text contrast', () => {
  const tokens = Object.fromEntries([...read('styles/arize-theme.css').matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map(([, name, value]) => [name, value]))
  const luminance = (hex: string) => {
    const c = hex.slice(1).match(/../g)!.map(v => Number.parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
  }
  for (const [text, background] of [['ink', 'cream'], ['ink', 'orange'], ['ink', 'yellow-soft'], ['muted', 'cream'], ['muted', 'surface'], ['muted', 'yellow-soft'], ['green', 'green-soft'], ['error', 'error-soft']]) {
    const [a, b] = [luminance(tokens[text]), luminance(tokens[background])].sort((x, y) => y - x)
    assert.ok((a + .05) / (b + .05) >= 4.5, `${text} on ${background}`)
  }
  for (const path of ['components/legal/ConsentForm.tsx', 'components/billing/BillingActions.tsx']) {
    assert.doesNotMatch(read(path), /rgba\(245,240,232|#D8C57D|#E8D99B|#E4846A/)
  }
})
