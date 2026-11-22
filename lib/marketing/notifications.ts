import { createHash } from 'node:crypto'
import { marketingId, normalizedEmail, type MarketingEnv, type MarketingStore } from './policy.ts'

export function notificationConfig(env: MarketingEnv) {
  const from = normalizedEmail(env.MARKETING_LEAD_FROM_EMAIL), to = normalizedEmail(env.MARKETING_LEAD_NOTIFY_EMAIL)
  const key = env.MARKETING_RESEND_API_KEY?.trim()
  if (env.ARIZE_EDITION === 'student' || env.MARKETING_NOTIFICATION_ENABLED !== 'true' || !from || !to || !key?.startsWith('re_')) return null
  return { from, to, key, digest: createHash('sha256').update(`arize-lead-v1:${from}:${to}`).digest('hex') }
}

// No user-controlled recipient, subject, HTML or arbitrary provider URL. All
// provider and database errors are reduced to fixed operational outcomes.
export async function notifyLead(store: MarketingStore, env: MarketingEnv, leadId: string | null = null, send: typeof fetch = fetch) {
  const config = notificationConfig(env)
  if (!config) return 'not_configured' as const
  let claim: Record<string,unknown>
  try {
    const value = await store.call('marketing_claim_notification', { p_lead_id: leadId, p_config_hash: config.digest })
    if (value === null) return 'nothing_due' as const
    if (!value || typeof value !== 'object') return 'unavailable' as const
    claim = value as Record<string,unknown>
    if (!marketingId(claim.id) || !marketingId(claim.token) || !normalizedEmail(claim.email)) return 'unavailable' as const
  } catch { return 'unavailable' as const }
  let result: 'sent' | 'retry' | 'review' = 'retry'
  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `arize-lead/${claim.id}` },
      body: JSON.stringify({ from: `Arize <${config.from}>`, to: [config.to], subject: 'New Arize product interest', text: `A visitor asked AmazeGen to contact them about Arize.\n\nEmail: ${claim.email}\nConsent: arize-marketing-2026-11-22\n\nThis is a product-interest request, not a new app account or paid membership. Reply only about Arize. Do not add this address to unrelated lists.` }),
    })
    if (response.ok) {
      const body = await response.json()
      result = body && typeof body.id === 'string' && body.id.length < 100 ? 'sent' : 'retry'
    } else if (response.status >= 400 && response.status < 500 && response.status !== 429) result = 'review'
  } catch { /* Uncertain delivery uses the SAME provider idempotency key. */ }
  try {
    const finished = await store.call('marketing_finish_notification', { p_lead_id: claim.id, p_token: claim.token, p_result: result })
    return finished === true ? result : 'unavailable' as const
  } catch { return 'unavailable' as const }
}
