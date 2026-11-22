import test from 'node:test'
import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { generateRequestDetails } from 'web-push'
import { allowedPushEndpoint, boundedJson, pushEnabled, pushSenderConfig, reminderState, reminderTime, reminderZone, samePushOrigin, subscriptionInput, REMINDER } from '../lib/notifications/policy.ts'
import { dispatchPush } from '../lib/notifications/delivery.ts'
const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
const pub = ecdh.getPublicKey().toString('base64url')
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/fictional-only', expirationTime: null, keys: { p256dh: pub, auth: randomBytes(16).toString('base64url') } }
const env = { ARIZE_EDITION: 'adult', BROWSER_PUSH_ENABLED: 'true', NEXT_PUBLIC_BROWSER_PUSH_ENABLED: 'true', BROWSER_PUSH_SEND_ENABLED: 'true', NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY: pub, BROWSER_PUSH_VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString('base64url'), BROWSER_PUSH_CONTACT: 'mailto:notify@example.test', NEXT_PUBLIC_APP_URL: 'https://arize.example.test' }
const claim = { id: 'f1000000-0000-4000-8000-000000000001', token: 'f2000000-0000-4000-8000-000000000001', subscription }
function fixture(claims: unknown = [claim], valid = true) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  return { calls, async call(name: string, args?: Record<string, unknown>) { calls.push({ name, args }); return name === 'browser_push_claim' ? claims : name === 'browser_push_lease_valid' ? valid : true } }
}
test('push is adult-only, fully opt-in and cannot send with missing/disabled configuration', async () => {
  assert.equal(pushEnabled(env), true); assert.ok(pushSenderConfig(env))
  for (const extra of [{ ARIZE_EDITION: 'student' }, { BROWSER_PUSH_ENABLED: 'false' }, { NEXT_PUBLIC_BROWSER_PUSH_ENABLED: 'false' }, { BROWSER_PUSH_SEND_ENABLED: 'false' }, { BROWSER_PUSH_VAPID_PRIVATE_KEY: '' }, { BROWSER_PUSH_CONTACT: 'http://localhost' }]) {
    const db = fixture()
    assert.equal((await dispatchPush(db, { ...env, ...extra }, async () => { throw new Error('Must not send') })).state, 'disabled')
    assert.equal(db.calls.length, 0)
  }
})
test('endpoint allowlist rejects SSRF, credentials, lookalikes, redirects and URL parameters', () => {
  for (const url of [subscription.endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/fictional', 'https://web.push.apple.com/fictional']) assert.equal(allowedPushEndpoint(url), true)
  for (const url of ['http://fcm.googleapis.com/fcm/send/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/fcm/send/a', 'https://user@fcm.googleapis.com/fcm/send/a', 'https://fcm.googleapis.com:8443/fcm/send/a', 'https://fcm.googleapis.com/redirect/a', subscription.endpoint + '?to=http://localhost', subscription.endpoint + '#token']) assert.equal(allowedPushEndpoint(url), false)
})
test('subscription and time validation reject private payloads, malformed keys and expired registrations', () => {
  assert.deepEqual(subscriptionInput(subscription), subscription)
  for (const value of [null, [], { ...subscription, userId: 'forged' }, { ...subscription, expirationTime: 1 }, { ...subscription, keys: { ...subscription.keys, auth: 'bad' } }, { ...subscription, keys: { ...subscription.keys, p256dh: 'A'.repeat(87) } }]) assert.equal(subscriptionInput(value), null)
  assert.equal(reminderTime('23:59'), true); assert.equal(reminderTime('24:00'), false)
  assert.equal(reminderZone('America/New_York'), true); assert.equal(reminderZone('Fake/Zone'), false)
})
test('browser state is an allowlisted DTO, never a serialized endpoint or malformed DB record', () => {
  const safe = { eligible: true, enabled: true, subscribed: false, time: '09:00', timezone: 'UTC' }
  assert.deepEqual(reminderState({ ...safe, subscription, userId: 'private' }), safe)
  assert.equal(reminderState({ ...safe, enabled: 'true' }), null)
  assert.equal(reminderState({ ...safe, timezone: 'Not/AZone' }), null)
})
test('push mutation origin is canonical and JSON has a hard byte bound', async () => {
  const request = (origin: string, host: string, site = 'same-origin') => new Request('https://internal.test/', { headers: { origin, host, 'sec-fetch-site': site } })
  assert.equal(samePushOrigin(request(env.NEXT_PUBLIC_APP_URL, 'arize.example.test'), env), true)
  assert.equal(samePushOrigin(request('https://evil.test', 'arize.example.test'), env), false)
  assert.equal(samePushOrigin(request(env.NEXT_PUBLIC_APP_URL, 'evil.test'), env), false)
  assert.equal(samePushOrigin(request(env.NEXT_PUBLIC_APP_URL, 'arize.example.test', 'cross-site'), env), false)
  await assert.rejects(boundedJson(new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(4_097) })))
})
test('delivery uses generic content, bounded TTL/timeout and a fresh lease check', async () => {
  const db = fixture(); let sent = 0
  const result = await dispatchPush(db, env, async (sub, payload, options) => {
    sent++; assert.deepEqual(sub, subscription); assert.deepEqual(JSON.parse(payload), REMINDER)
    assert.equal(options.TTL, 900); assert.equal(options.timeout, 5_000); assert.equal(options.topic, REMINDER.tag)
    assert.doesNotMatch(payload, /userId|conversation|score|name|token/i)
  })
  assert.equal(sent, 1); assert.equal(result.sent, 1)
  assert.deepEqual(db.calls.map(c => c.name), ['browser_push_claim', 'browser_push_lease_valid', 'browser_push_finish'])
  const revoked = fixture([claim], false)
  await dispatchPush(revoked, env, async () => { throw new Error('Revoked must not send') })
  assert.equal(revoked.calls.length, 2)
})
test('real installed push SDK encrypts the generic request offline with per-call VAPID', () => {
  const options = { vapidDetails: pushSenderConfig(env)!, TTL: 900, timeout: 5_000, urgency: 'low' as const, topic: REMINDER.tag }
  const request = generateRequestDetails(subscription, JSON.stringify(REMINDER), options)
  assert.equal(request.endpoint, subscription.endpoint)
  assert.ok(request.body); assert.ok(request.headers.Authorization || request.headers.authorization)
  assert.doesNotMatch(request.body!.toString(), /A little space/)
})
test('gone endpoints are removed; transient failures retry; malformed/permanent failures never loop', async () => {
  for (const [status, outcome] of [[410, 'gone'], [404, 'gone'], [429, 'retry'], [503, 'retry'], [401, 'failed'], [400, 'failed']] as const) {
    const db = fixture()
    await dispatchPush(db, env, async () => { throw { statusCode: status, body: 'private provider detail' } })
    assert.equal(db.calls.at(-1)?.args?.p_result, outcome)
    assert.doesNotMatch(JSON.stringify(db.calls), /private provider detail/)
  }
  const bad = fixture([{ ...claim, subscription: { ...subscription, endpoint: 'https://127.0.0.1/private' } }])
  await dispatchPush(bad, env, async () => { throw new Error('Must not send') })
  assert.equal(bad.calls.at(-1)?.args?.p_result, 'failed')
  await assert.rejects(dispatchPush(fixture([{ ...claim, token: 'forged' }]), env, async () => undefined))
})
test('service worker ignores arbitrary remote text and URLs, has no fetch handler/cache and opens home', async () => {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {}
  let shown: unknown, opened = ''; const waits: Promise<unknown>[] = []
  const self = { location: { origin: 'https://arize.example.test' }, addEventListener: (type: string, handler: typeof handlers[string]) => { handlers[type] = handler }, registration: { showNotification: async (title: string, options: unknown) => { shown = { title, options } } }, clients: { matchAll: async () => [], openWindow: async (url: string) => { opened = url } } }
  runInNewContext(readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8'), { self, URL })
  handlers.push({ data: { json: () => ({ body: 'private chat', url: 'https://evil.test' }) }, waitUntil: (promise: Promise<unknown>) => waits.push(promise) })
  handlers.notificationclick({ notification: { close() {} }, waitUntil: (promise: Promise<unknown>) => waits.push(promise) })
  await Promise.all(waits)
  assert.doesNotMatch(JSON.stringify(shown), /private chat|evil.test/)
  assert.equal(opened, 'https://arize.example.test/home'); assert.equal('fetch' in handlers, false)
})
test('offline foundation remains bundled and account connections require separate explicit configuration', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const config = read('apps/mobile/capacitor.config.ts'), app = read('apps/mobile/src/main.tsx'), reminders = read('apps/mobile/src/reminders.ts')
  assert.match(config, /webDir: 'dist'/); assert.doesNotMatch(config, /server:\s*\{|allowNavigation|cleartext/)
  assert.doesNotMatch(app + reminders, /fetch\(|supabase|stripe|OPENAI|students\.arizeapp|api\/coach/i)
  assert.match(app, /No live account/); assert.match(app, /not connected to this native build yet/)
  assert.match(reminders, /requestPermissions/); assert.match(reminders, /cancel\(/)
  assert.match(read('vercel.json'), /"codex\/phase-7-push-ios": false/)
  for (const flag of ['NEXT_PUBLIC_BROWSER_PUSH_ENABLED', 'BROWSER_PUSH_ENABLED', 'BROWSER_PUSH_SEND_ENABLED']) assert.ok(read('.env.example').split('\n').includes(`${flag}=false`))
})
