import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { subscriptionAccessRecord } from '../lib/billing/access-record.ts'

const userId = '0d6e5bed-2a98-4c8a-a588-6c835370513a'
const priceId = 'price_arize_plus_monthly'

function subscription(overrides: Partial<Stripe.Subscription> = {}) {
  return {
    id: 'sub_arize_test',
    object: 'subscription',
    customer: 'cus_arize_test',
    metadata: {
      arize_app: 'arize',
      arize_user_id: userId,
      arize_plan: 'plus',
    },
    status: 'trialing',
    start_date: 1_788_480_000,
    trial_end: 1_789_084_800,
    cancel_at_period_end: false,
    livemode: false,
    items: {
      data: [{
        current_period_start: 1_788_480_000,
        current_period_end: 1_789_084_800,
        price: { id: priceId, recurring: { interval: 'month' } },
      }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

test('verified Stripe trial creates an active Plus trial grant', () => {
  const record = subscriptionAccessRecord(subscription(), [priceId])
  assert.equal(record?.userId, userId)
  assert.equal(record?.customerId, 'cus_arize_test')
  assert.equal(record?.grant.source, 'checkout_trial')
  assert.equal(record?.grant.status, 'active')
  assert.equal(record?.grant.external_reference, 'sub_arize_test')
})

test('unknown Stripe prices cannot grant Arize access', () => {
  assert.equal(subscriptionAccessRecord(subscription(), ['price_something_else']), null)
})

test('past-due Stripe subscriptions are revoked fail-closed', () => {
  const record = subscriptionAccessRecord(subscription({ status: 'past_due' }), [priceId])
  assert.equal(record?.grant.source, 'subscription')
  assert.equal(record?.grant.status, 'revoked')
})

test('active subscriptions retain access through a period-end cancellation', () => {
  const record = subscriptionAccessRecord(subscription({
    status: 'active',
    trial_end: null,
    cancel_at_period_end: true,
  }), [priceId])

  assert.equal(record?.grant.source, 'subscription')
  assert.equal(record?.grant.status, 'active')
  assert.equal(record?.grant.ends_at, '2026-09-11T00:00:00.000Z')
  assert.equal(record?.grant.metadata.cancel_at_period_end, true)
})

test('canceled, unpaid, and incomplete subscriptions cannot grant Plus', () => {
  for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const) {
    const record = subscriptionAccessRecord(subscription({ status }), [priceId])
    assert.equal(record?.grant.status, 'revoked', status)
  }
})

test('annual prices are recorded as annual memberships', () => {
  const annual = subscription()
  annual.items.data[0]!.price.recurring = {
    interval: 'year',
    interval_count: 1,
    meter: null,
    trial_period_days: null,
    usage_type: 'licensed',
  }

  const record = subscriptionAccessRecord(annual, [priceId])
  assert.equal(record?.grant.metadata.billing_period, 'annual')
})

test('untrusted subscription metadata cannot attach access to an invalid user', () => {
  const record = subscriptionAccessRecord(subscription({
    metadata: {
      arize_app: 'arize',
      arize_user_id: 'not-a-user-id',
      arize_plan: 'plus',
    },
  }), [priceId])

  assert.equal(record, null)
})

test('renewal payment failure grants only a bounded 72-hour recovery window', () => {
  const now = Math.floor(Date.now() / 1000)
  const invoice = { billing_reason: 'subscription_cycle', status_transitions: { finalized_at: now }, created: now } as Stripe.Invoice
  const grace = subscriptionAccessRecord(subscription({ status: 'past_due', latest_invoice: invoice }), [priceId])
  assert.equal(grace?.grant.status, 'active')
  assert.equal(Date.parse(grace!.grant.ends_at!) - now * 1000, 72 * 60 * 60_000)
  const expired = subscriptionAccessRecord(subscription({ status: 'past_due', latest_invoice: { ...invoice, status_transitions: { ...invoice.status_transitions, finalized_at: now - 73 * 3600 } } }), [priceId])
  assert.equal(expired?.grant.status, 'revoked')
})
test('active subscriptions with no period boundary cannot grant indefinite access', () => {
  const value = subscription({ status: 'active' }); value.items.data[0]!.current_period_end = 0
  assert.throws(() => subscriptionAccessRecord(value, [priceId]), /bounded access period/)
})
