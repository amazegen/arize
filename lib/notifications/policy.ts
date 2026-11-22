export type PushEnv = Record<string, string | undefined>
export const REMINDER = {
  title: 'Arize',
  body: 'A little space for you. Open Arize when you have a moment.',
  tag: 'arize-daily-check-in',
} as const
export interface BrowserSubscription {
  endpoint: string
  expirationTime: number | null
  keys: { p256dh: string; auth: string }
}
export interface ReminderState {
  eligible: boolean
  enabled: boolean
  subscribed: boolean
  time: string
  timezone: string
}
export interface PushStore { call(name: string, args?: Record<string, unknown>): Promise<unknown> }

export function pushEnabled(env: PushEnv): boolean {
  return env.ARIZE_EDITION !== 'student' && env.BROWSER_PUSH_ENABLED === 'true'
    && env.NEXT_PUBLIC_BROWSER_PUSH_ENABLED === 'true'
}
export function samePushOrigin(request: Request, env: PushEnv): boolean {
  try {
    const expected = new URL(env.NEXT_PUBLIC_APP_URL ?? '')
    return expected.origin === env.NEXT_PUBLIC_APP_URL && request.headers.get('origin') === expected.origin
      && request.headers.get('host') === expected.host
      && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')
  } catch { return false }
}
export function reminderTime(time: unknown): time is string {
  return typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
}
export function reminderZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 80 || !/^[A-Za-z_+\-/]+$/.test(zone)) return false
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true } catch { return false }
}
export function reminderState(value: unknown): ReminderState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.eligible !== 'boolean' || typeof v.enabled !== 'boolean' || typeof v.subscribed !== 'boolean' || !reminderTime(v.time) || !reminderZone(v.timezone)) return null
  return { eligible: v.eligible, enabled: v.enabled, subscribed: v.subscribed, time: v.time, timezone: v.timezone }
}
function keyLength(value: unknown, length: number): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false
  try {
    const decoded = Buffer.from(value, 'base64url')
    return decoded.length === length && decoded.toString('base64url') === value
      && (length !== 65 || decoded[0] === 4)
  } catch { return false }
}
// Endpoints are outbound network capabilities, not arbitrary user URLs.
// No redirects, custom ports, subdomain wildcards, credentials or local hosts.
export function allowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search) return false
    const prefixes: Record<string, string[]> = {
      'fcm.googleapis.com': ['/fcm/send/', '/wp/'],
      'updates.push.services.mozilla.com': ['/wpush/'],
      'web.push.apple.com': ['/'],
    }
    return (prefixes[url.hostname] ?? []).some(prefix => url.pathname.startsWith(prefix) && url.pathname.length > prefix.length)
      && url.href === value
  } catch { return false }
}
export function subscriptionInput(value: unknown, now = Date.now()): BrowserSubscription | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(k => !['endpoint', 'expirationTime', 'keys'].includes(k)) || !allowedPushEndpoint(v.endpoint)) return null
  if (!v.keys || typeof v.keys !== 'object' || Array.isArray(v.keys)) return null
  const keys = v.keys as Record<string, unknown>
  if (Object.keys(keys).sort().join(',') !== 'auth,p256dh' || !keyLength(keys.p256dh, 65) || !keyLength(keys.auth, 16)) return null
  if (v.expirationTime !== null && (typeof v.expirationTime !== 'number' || !Number.isFinite(v.expirationTime) || v.expirationTime <= now)) return null
  return { endpoint: v.endpoint, expirationTime: v.expirationTime as number | null, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}
export function pushSenderConfig(env: PushEnv) {
  if (!pushEnabled(env) || env.BROWSER_PUSH_SEND_ENABLED !== 'true') return null
  const publicKey = env.NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY, privateKey = env.BROWSER_PUSH_VAPID_PRIVATE_KEY
  const subject = env.BROWSER_PUSH_CONTACT
  if (!keyLength(publicKey, 65) || !keyLength(privateKey, 32) || !subject || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) return null
  return { publicKey, privateKey, subject }
}
export async function boundedJson(request: Request, max = 4_096): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new Error('Invalid request')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Invalid request')
  const chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const { value, done } = await reader.read(); if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel(); throw new Error('Invalid request') }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
