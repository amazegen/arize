import type Stripe from 'stripe'
import { BILLING_EVENTS, RISK_EVENTS, invoiceSubscription } from './policy.ts'

export interface WebhookStore {
  claim(event: Stripe.Event, token: string): Promise<'claimed' | 'processed' | 'busy'>
  finish(eventId: string, token: string, error?: string): Promise<void>
  sync(subscriptionId: string): Promise<void>
  risk(event: Stripe.Event, subscriptions: string[]): Promise<void>
}

export async function processBillingWebhook(stripe: Stripe, store: WebhookStore, event: Stripe.Event, token: string) {
  if (!(BILLING_EVENTS as readonly string[]).includes(event.type)) return { duplicate: false, ignored: true }
  const claim = await store.claim(event, token)
  if (claim === 'processed') return { duplicate: true, ignored: false }
  // Returning 2xx here would permanently swallow a concurrent delivery if the
  // first worker crashes. A busy claim must ask Stripe to retry.
  if (claim === 'busy') throw new Error('Webhook processing is in progress; retry')
  try {
    const ids = new Set<string>()
    if (event.type.startsWith('customer.subscription.')) ids.add((event.data.object as Stripe.Subscription).id)
    else if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'subscription' && session.subscription) ids.add(typeof session.subscription === 'string' ? session.subscription : session.subscription.id)
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const id = invoiceSubscription(event.data.object as Stripe.Invoice)
      if (id) ids.add(id)
    } else if (RISK_EVENTS.has(event.type)) {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute | Stripe.Radar.EarlyFraudWarning
      const charge = event.type === 'charge.refunded' ? object as Stripe.Charge
        : await stripe.charges.retrieve(typeof (object as Stripe.Dispute).charge === 'string'
          ? (object as Stripe.Dispute).charge as string : ((object as Stripe.Dispute).charge as Stripe.Charge).id)
      const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      const payment = intent ? { type: 'payment_intent' as const, payment_intent: intent }
        : { type: 'charge' as const, charge: charge.id }
      for await (const item of stripe.invoicePayments.list({ payment, limit: 100 })) {
        const invoice = typeof item.invoice === 'string' ? await stripe.invoices.retrieve(item.invoice) : item.invoice
        if (!('deleted' in invoice)) { const id = invoiceSubscription(invoice); if (id) ids.add(id) }
      }
      await store.risk(event, [...ids])
    }
    for (const id of ids) await store.sync(id)
    await store.finish(event.id, token)
    return { duplicate: false, ignored: false }
  } catch (error) {
    await store.finish(event.id, token, 'retry_required').catch(() => undefined)
    throw error
  }
}
