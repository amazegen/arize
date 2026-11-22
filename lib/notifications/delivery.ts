import { pushSenderConfig, REMINDER, subscriptionInput, type PushEnv, type PushStore, type BrowserSubscription } from './policy.ts'

export type PushTransport = (subscription: BrowserSubscription, payload: string, options: {
  vapidDetails: { publicKey: string; privateKey: string; subject: string }
  TTL: number; timeout: number; urgency: 'low'; topic: string
}) => Promise<unknown>
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function dispatchPush(store: PushStore, env: PushEnv, send: PushTransport) {
  const vapidDetails = pushSenderConfig(env)
  if (!vapidDetails) return { state: 'disabled', sent: 0, retry: 0, removed: 0, failed: 0 }
  const totals = { state: 'complete', sent: 0, retry: 0, removed: 0, failed: 0 }
  // Small bounded batch, no unbounded background work. Caller chooses cadence.
  const claims = await store.call('browser_push_claim', { p_limit: 20 })
  if (!Array.isArray(claims) || claims.length > 20) throw new Error('Invalid reminder batch')
  const deliver = async (claim: typeof claims[number]) => {
    if (!claim || !uuid.test(claim.id) || !uuid.test(claim.token)) throw new Error('Invalid reminder claim')
    let outcome: 'sent' | 'retry' | 'gone' | 'failed' = 'failed'
    const subscription = subscriptionInput(claim.subscription)
    if (subscription) {
      // Re-check revocation, deletion, schedule version and lease just before send.
      const valid = await store.call('browser_push_lease_valid', { p_id: claim.id, p_token: claim.token })
      if (valid !== true) return
      try {
        await send(subscription, JSON.stringify(REMINDER), { vapidDetails, TTL: 900, timeout: 5_000, urgency: 'low', topic: REMINDER.tag })
        outcome = 'sent'
      } catch (error) {
        const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0
        outcome = [404, 410].includes(status) ? 'gone' : !status || status === 429 || status >= 500 ? 'retry' : 'failed'
      }
    }
    await store.call('browser_push_finish', { p_id: claim.id, p_token: claim.token, p_result: outcome })
    totals[outcome === 'gone' ? 'removed' : outcome]++
  }
  for (let start = 0; start < claims.length; start += 4) {
    await Promise.all(claims.slice(start, start + 4).map(deliver))
  }
  return totals
}
