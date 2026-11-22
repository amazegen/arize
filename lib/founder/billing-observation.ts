import type Stripe from 'stripe'
import { invoiceSubscription } from '../billing/policy.ts'

export function billingObservation(event: Stripe.Event) {
  let subscriptionId: string | null = null
  let paidAt: string | null = null
  if (event.type.startsWith('customer.subscription.')) subscriptionId = (event.data.object as Stripe.Subscription).id
  else if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode === 'subscription') subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    subscriptionId = invoiceSubscription(invoice)
    if (event.type === 'invoice.paid' && subscriptionId && invoice.status === 'paid' && invoice.amount_paid > 0 && invoice.currency === 'usd') {
      const seconds = invoice.status_transitions?.paid_at ?? event.created
      if (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= event.created + 300) paidAt = new Date(seconds * 1000).toISOString()
    }
  }
  return { eventId: event.id, subscriptionId, paidAt }
}

// Reporting must never change the existing webhook acknowledgement, access
// grant or checkout outcome. Missing captures are detected by the dashboard's
// receipt-vs-webhook check; a duplicate delivery can safely repair the receipt.
export async function observeBillingSafely(event: Stripe.Event, save: (observation: ReturnType<typeof billingObservation>) => Promise<void>) {
  try { await save(billingObservation(event)); return true }
  catch { return false }
}
