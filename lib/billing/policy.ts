import type Stripe from 'stripe'
import { MEMBERSHIP_PRICING } from '../access/entitlements.ts'

export type BillingPeriod = 'monthly' | 'annual'
export const BILLING_EVENTS = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
  'invoice.paid', 'invoice.payment_failed',
  'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created',
] as const
export const RISK_EVENTS = new Set(['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created'])
export const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
export const PAYMENT_GRACE_HOURS = 72

export function sameOrigin(request: Request) {
  // Browser billing mutations must identify their origin; missing is not trusted.
  return request.headers.get('origin') === new URL(request.url).origin
}

export function validBillingUrl(value: unknown, kind: 'checkout' | 'portal') {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname === (kind === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com')
  } catch { return false }
}

export function assertPrice(price: Stripe.Price, period: BillingPeriod, live: boolean) {
  const amount = Math.round((period === 'monthly' ? MEMBERSHIP_PRICING.monthlyUsd : MEMBERSHIP_PRICING.annualUsd) * 100)
  if (!price.active || price.livemode !== live || price.currency !== 'usd'
    || price.unit_amount !== amount || price.type !== 'recurring'
    || price.recurring?.interval !== (period === 'annual' ? 'year' : 'month')
    || price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed') {
    throw new Error('Configured price does not match the approved membership offer')
  }
  if (typeof price.product !== 'string' && ('deleted' in price.product || !price.product.active)) {
    throw new Error('The membership product is not active')
  }
}

export function invoiceSubscription(invoice: Stripe.Invoice) {
  const value = invoice.parent?.subscription_details?.subscription
  return typeof value === 'string' ? value : value?.id ?? null
}

export function subscriptionCustomer(subscription: Stripe.Subscription) {
  return typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
}

export function hasBillableSubscription(status: Stripe.Subscription.Status) {
  return !['canceled', 'incomplete_expired'].includes(status)
}

export function newTrialEligible(subscriptions: Pick<Stripe.Subscription, 'trial_start' | 'trial_end' | 'status'>[]) {
  // A canceled/completed trial is still a used trial. Never reset on cancellation.
  return subscriptions.length === 0
}

export function recentSignIn(lastSignIn: unknown, now = Date.now()) {
  const at = typeof lastSignIn === 'string' ? Date.parse(lastSignIn) : NaN
  return Number.isFinite(at) && at <= now + 30_000 && now - at <= 15 * 60_000
}

export function validDeletionBody(body: unknown) {
  return typeof body === 'object' && body !== null
    && (body as Record<string, unknown>).confirmation === 'DELETE MY ACCOUNT'
    && (body as Record<string, unknown>).acknowledged === true
}
