import type Stripe from 'stripe'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { safeBillingError } from '@/lib/billing/safe-error'
import { assertExpectedStripeAccount, assertExpectedStripeMode, getStripe } from '@/lib/billing/stripe'
import { syncStripeSubscription } from '@/lib/billing/subscriptions'
import { processBillingWebhook } from '@/lib/billing/webhook-workflow'
import { NO_STORE } from '@/lib/billing/policy'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!signature || !secret) return reply({ error: 'Webhook is not configured.' }, 503)
  let event: Stripe.Event
  let stripe: Stripe
  try { stripe = getStripe() } catch { return reply({ error: 'Webhook is not configured.' }, 503) }
  try {
    // Verify the original bytes, never a parsed/re-serialized JSON payload.
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (!reader) return reply({ error: 'Missing payload.' }, 400)
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1_048_576) { await reader.cancel(); return reply({ error: 'Payload too large.' }, 413) }
      chunks.push(value)
    }
    event = stripe.webhooks.constructEvent(Buffer.concat(chunks), signature, secret)
    assertExpectedStripeMode(event.livemode)
  } catch (error) {
    console.error('[billing webhook: verification]', safeBillingError(error))
    return reply({ error: 'Invalid webhook signature or mode.' }, 400)
  }
  try {
    await assertExpectedStripeAccount(stripe)
    const admin = createAdminClient()
    const result = await processBillingWebhook(stripe, {
      async claim(event, token) {
        const { data, error } = await admin.rpc('claim_billing_webhook_v2', {
          p_event_id: event.id, p_event_type: event.type, p_livemode: event.livemode, p_token: token,
        })
        if (error || !['claimed', 'processed', 'busy'].includes(data)) throw error ?? new Error('Invalid webhook claim')
        return data as 'claimed' | 'processed' | 'busy'
      },
      async finish(id, token, failure) {
        const { data, error } = await admin.rpc('finish_billing_webhook_v2', { p_event_id: id, p_token: token, p_error: failure ?? null })
        if (error || !data) throw error ?? new Error('Webhook lease expired')
      },
      async sync(id) { await syncStripeSubscription(admin, await stripe.subscriptions.retrieve(id), stripe) },
      async risk(event, ids) {
        const { error } = await admin.from('billing_risk_events').upsert({
          event_id: event.id, event_type: event.type, livemode: event.livemode, subscription_ids: ids,
        }, { onConflict: 'event_id', ignoreDuplicates: true })
        if (error) throw error
        console.warn('[billing risk review required]', event.type)
      },
    }, event, randomUUID())
    return reply({ received: true, ...result })
  } catch (error) {
    console.error('[billing webhook: processing]', safeBillingError(error))
    return reply({ error: 'Webhook processing must be retried.' }, 503)
  }
}
