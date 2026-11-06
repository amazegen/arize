import 'server-only'

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getConfiguredStripePriceIds } from '@/lib/billing/stripe'
import { subscriptionAccessRecord } from '@/lib/billing/access-record'
import { randomUUID } from 'node:crypto'
import { billingStore } from './store'
import { subscriptionCustomer } from './policy'

export async function syncStripeSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
  stripe: Stripe,
) {
  const store = billingStore(supabase)
  const owner = await store.owner(subscriptionCustomer(subscription))
  if (!owner) return { ignored: true }
  const token = randomUUID()
  if (!await store.claim(owner, token)) throw new Error('Billing sync is busy; retry this webhook')
  try {
    if (await store.isDeleting(owner)) return { ignored: true }
    // Do not apply an event's stale embedded snapshot. Serializing the current
    // Stripe read and database write also prevents parallel out-of-order saves.
    const current = await stripe.subscriptions.retrieve(subscription.id, { expand: ['latest_invoice'] })
    if (current.livemode !== (process.env.STRIPE_EXPECTED_MODE === 'live')) return { ignored: true }
    const record = subscriptionAccessRecord(current, getConfiguredStripePriceIds())
    let grant = record?.userId === owner ? record.grant : null
    if (!grant) {
      // A previously valid subscription moved to an unapproved price/metadata
      // must not leave its old paid grant active forever.
      const previous = await supabase.from('access_grants').select('*').eq('external_reference', current.id).eq('user_id', owner).maybeSingle()
      if (previous.error) throw previous.error
      if (!previous.data) return { ignored: true }
      grant = { ...previous.data, status: 'revoked', metadata: { ...previous.data.metadata, stripe_customer_id: subscriptionCustomer(current), livemode: current.livemode }, updated_at: new Date().toISOString() }
    }
    const result = await supabase.rpc('apply_billing_access', { p_user: owner, p_token: token, p_grant: grant })
    if (result.error) throw result.error
    if (result.data !== true) throw new Error('Billing operation lease expired; retry this webhook')
    return { ignored: false }
  } finally { await store.release(owner, token) }
}
