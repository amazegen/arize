import type Stripe from 'stripe'
import type { Json } from '../types'

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function idFromExpandable<T extends { id: string }>(value: string | T | null) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  return {
    startsAt: new Date((item?.current_period_start ?? subscription.start_date) * 1000).toISOString(),
    endsAt: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
  }
}

export function subscriptionAccessRecord(
  subscription: Stripe.Subscription,
  configuredPriceIds: readonly string[],
) {
  const userId = subscription.metadata.arize_user_id
  const configuredPrices = new Set(configuredPriceIds)
  const price = subscription.items.data[0]?.price
  const isArizeSubscription = subscription.metadata.arize_app === 'arize'
    && subscription.metadata.arize_plan === 'plus'
    && USER_ID_PATTERN.test(userId ?? '')
    && Boolean(price?.id && configuredPrices.has(price.id))

  if (!isArizeSubscription || !userId || !price) return null
  const period = subscriptionPeriod(subscription)
  if (['active', 'trialing'].includes(subscription.status) && (!period.endsAt || (subscription.status === 'trialing' && !subscription.trial_end))) {
    throw new Error('A verified membership must have a bounded access period')
  }

  const invoice = typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null
  const paymentGraceEnd = subscription.status === 'past_due' && invoice?.billing_reason === 'subscription_cycle'
    ? (invoice.status_transitions.finalized_at ?? invoice.created) * 1000 + 72 * 60 * 60_000 : null
  const paymentGrace = paymentGraceEnd !== null && paymentGraceEnd > Date.now()
  const active = subscription.status === 'trialing' || subscription.status === 'active' || paymentGrace
  const { startsAt, endsAt: periodEndsAt } = subscriptionPeriod(subscription)
  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null
  const billingPeriod = price.recurring?.interval === 'year' ? 'annual' : 'monthly'

  return {
    userId,
    customerId: idFromExpandable(subscription.customer),
    grant: {
      user_id: userId,
      plan: 'plus' as const,
      source: subscription.status === 'trialing' ? 'checkout_trial' as const : 'subscription' as const,
      status: active ? 'active' as const : 'revoked' as const,
      starts_at: startsAt,
      ends_at: subscription.status === 'trialing' ? trialEndsAt : paymentGrace ? new Date(paymentGraceEnd!).toISOString() : periodEndsAt,
      external_reference: subscription.id,
      metadata: {
        provider: 'stripe',
        stripe_status: subscription.status,
        stripe_customer_id: idFromExpandable(subscription.customer),
        price_id: price.id,
        billing_period: billingPeriod,
        cancel_at_period_end: subscription.cancel_at_period_end,
        livemode: subscription.livemode,
        payment_grace: paymentGrace,
      } satisfies Json,
      updated_at: new Date().toISOString(),
    },
  }
}
