import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export const LEAD_CONSENT_VERSION = 'arize-marketing-2026-11-22'
export const LEAD_SUCCESS = 'Thank you. Your interest has been recorded. AmazeGen may contact you about Arize.'
export type MarketingEnv = Record<string, string | undefined>
export const marketingId = (value: unknown): value is string => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null
  if (email.split('@')[0].length > 64 || email.split('@')[0].startsWith('.') || email.split('@')[0].endsWith('.') || email.includes('..')) return null
  return email
}
export function marketingOrigin(env: MarketingEnv) {
  try {
    const u = new URL(env.NEXT_PUBLIC_APP_URL ?? '')
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1','localhost'].includes(u.hostname)))) return null
    return u.origin
  } catch { return null }
}
export function captureConfigured(env: MarketingEnv) {
  return env.ARIZE_EDITION !== 'student' && env.MARKETING_LEAD_CAPTURE_ENABLED === 'true'
    && Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && (env.MARKETING_RATE_LIMIT_SECRET?.length ?? 0) >= 32 && marketingOrigin(env))
}
export function sameMarketingOrigin(request: Request, env: MarketingEnv) {
  const origin = marketingOrigin(env)
  return origin !== null && request.headers.get('origin') === origin
    && (request.headers.get('host') ?? new URL(request.url).host) === new URL(origin).host
    && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')
}
export type LeadInput = { email: string; consent: true }
export function leadInput(body: unknown): LeadInput | 'honeypot' | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const v = body as Record<string, unknown>
  if (Object.keys(v).some(k => !['email','consent','website'].includes(k))) return null
  if (typeof v.website !== 'string' || v.website.length > 300) return null
  if (v.website.trim()) return 'honeypot'
  const email = normalizedEmail(v.email)
  return email && v.consent === true ? { email, consent: true } : null
}
export function rateKeys(request: Request, email: string, env: MarketingEnv, now = new Date()) {
  const secret = env.MARKETING_RATE_LIMIT_SECRET
  if (!secret || secret.length < 32) throw new Error('Marketing configuration unavailable')
  // Trust Vercel's overwritten IP header only on Vercel. Do not persist raw IPs
  // or trust arbitrary forwarded headers on local/self-hosted servers.
  const candidate = env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.trim() : null
  const ip = candidate && isIP(candidate) ? candidate : 'shared-unknown-origin'
  const day = now.toISOString().slice(0,10)
  const digest = (kind: string, value: string) => createHmac('sha256',secret).update(`${day}:${kind}:${value}`).digest('hex')
  return { ip: digest('ip',ip), email: digest('email',email) }
}

export interface MarketingStore { call(name: string, args?: Record<string, unknown>): Promise<unknown> }
export async function captureLead(store: MarketingStore, email: string, keys: { ip: string; email: string }) {
  const result = await store.call('marketing_capture_lead', { p_email: email, p_ip_key: keys.ip, p_email_key: keys.email, p_consent_version: LEAD_CONSENT_VERSION })
  if (!result || typeof result !== 'object' || !('accepted' in result) || typeof result.accepted !== 'boolean') throw new Error('Invalid marketing result')
  const id = 'leadId' in result ? result.leadId : null
  if (id !== null && !marketingId(id)) throw new Error('Invalid marketing result')
  return { accepted: result.accepted, leadId: id as string | null }
}
