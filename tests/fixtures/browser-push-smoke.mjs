import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
if (!process.argv.includes('--synthetic-only')) throw new Error('Explicit local fixture flag required')
const app = 'http://127.0.0.1:3177', backend = 'http://127.0.0.1:3176'
async function login(email) {
  const response = await fetch(`${backend}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'reminder-fixture-only' }) })
  assert.equal(response.status, 200)
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(await response.json())).toString('base64url')}`
}
const cookie = await login('reminder@example.test'), fresh = await login('new@example.test')
const post = (body, extra = {}) => fetch(`${app}/api/notifications/browser`, { method: 'POST', headers: { origin: app, 'content-type': 'application/json', cookie, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) })
assert.equal((await post({ action: 'state' }, { cookie: '' })).status, 401)
assert.equal((await post({ action: 'state' }, { origin: 'https://evil.test' })).status, 403)
assert.equal((await post({ action: 'state', userId: 'forged' })).status, 400)
assert.equal((await post({ action: '__proto__' })).status, 400)
assert.equal((await post('x'.repeat(5000))).status, 400)
const state = await post({ action: 'state' }); assert.equal(state.status, 200)
assert.match(state.headers.get('cache-control'), /private, no-store/)
const settings=await state.json();assert.equal(settings.eligible,true)
const freshSettings=await(await post({action:'state'},{cookie:fresh})).json();assert.equal(freshSettings.eligible,false)
const curve = createECDH('prime256v1'); curve.generateKeys()
const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/fictional-${randomBytes(8).toString('hex')}`, expirationTime: null, keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }
const register = { action: 'register', subscription, time: '09:30', timezone: 'America/New_York',accountGuard:settings.accountGuard }
assert.equal((await post({...register,accountGuard:freshSettings.accountGuard}, { cookie: fresh })).status, 409)
assert.equal((await post({ ...register, subscription: { ...subscription, endpoint: 'https://127.0.0.1/private' } })).status, 400)
assert.equal((await post(register)).status, 200)
assert.equal((await fetch(`${app}/api/notifications/dispatch`, { method: 'POST' })).status, 401)
const dispatch = await fetch(`${app}/api/notifications/dispatch`, { method: 'POST', headers: { authorization: 'Bearer fictional-push-dispatch-secret-only-12345' } })
assert.equal(dispatch.status, 200); assert.deepEqual(await dispatch.json(), { state: 'disabled' })
const manifest = await (await fetch(`${app}/manifest.webmanifest`)).json(); assert.equal(manifest.start_url, '/home')
const worker = await (await fetch(`${app}/push-sw.js`)).text(); assert.doesNotMatch(worker, /addEventListener\('fetch'|caches\./)
console.log('Local HTTP + real SQL passed: auth, origin/body/SSRF/eligibility guards, registration, no-store, manifest/worker, dispatcher remains disabled. No real push sent.')
