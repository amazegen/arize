// Local acceptance regressions. These do not make Stripe API calls or prove
// provider sandbox checkout/portal/Auth/Storage acceptance.
import assert from 'node:assert/strict'
import test from 'node:test'
import Stripe from 'stripe'
import { billingAppOrigin } from '../lib/billing/config.ts'
import { subscriptionAccessRecord } from '../lib/billing/access-record.ts'
import { resolveAccess } from '../lib/access/entitlements.ts'
import { signContinuity, verifyContinuity, CONTINUITY_SECONDS } from '../lib/access/continuity.ts'

const user = '0d6e5bed-2a98-4c8a-a588-6c835370513a'
const price = 'price_fixture_monthly'
const epoch = Date.parse('2026-11-19T12:00:00Z')
function subscription(status: Stripe.Subscription.Status, end = epoch / 1000) {
  return { id: 'sub_fixture', customer: 'cus_fixture', livemode: false, status,
    metadata: { arize_app: 'arize', arize_user_id: user, arize_plan: 'plus' },
    start_date: epoch / 1000 - 30 * 86400, trial_end: null, cancel_at_period_end: false,
    items: { data: [{ current_period_start: epoch / 1000 - 30 * 86400, current_period_end: end,
      price: { id: price, recurring: { interval: 'month' } } }] },
  } as unknown as Stripe.Subscription
}

test('sandbox redirect origin accepts both local loopbacks and rejects lookalikes/non-origins', () => {
  for (const origin of ['http://localhost:3119', 'http://127.0.0.1:3119', 'https://arize.example']) {
    assert.equal(billingAppOrigin(origin), origin)
  }
  for (const origin of [undefined, '', 'http://localhost.evil.example', 'http://arize.example',
    'https://arize.example/upgrade', 'https://arize.example?next=bad', 'https://arize.example#bad',
    'https://user:password@arize.example', 'file:///tmp/test']) {
    assert.throws(() => billingAppOrigin(origin))
  }
})

test('real Stripe SDK verifies signed original bytes, rejecting tampering and wrong secret', () => {
  const stripe = new Stripe('sk_test_local_signature_fixture')
  const payload = JSON.stringify({ id: 'evt_local_fixture', object: 'event', type: 'invoice.paid', livemode: false, data: { object: {} } })
  const secret = 'whsec_local_signature_fixture'
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, 'evt_local_fixture')
  assert.throws(() => stripe.webhooks.constructEvent(payload + ' ', header, secret))
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_wrong_fixture'))
  const stale = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 600 })
  assert.throws(() => stripe.webhooks.constructEvent(payload, stale, secret))
})

test('active-renewal grace ends at 72 hours; known period-end cancellation is not extended', () => {
  const active = subscriptionAccessRecord(subscription('active'), [price])!.grant
  assert.equal(resolveAccess([active], true, new Date(epoch + 72 * 3600_000 - 1)).plan, 'plus')
  assert.equal(resolveAccess([active], true, new Date(epoch + 72 * 3600_000)).plan, 'core')
  const canceling = { ...active, metadata: { ...active.metadata, cancel_at_period_end: true } }
  assert.equal(resolveAccess([canceling], true, new Date(epoch - 1)).plan, 'plus')
  assert.equal(resolveAccess([canceling], true, new Date(epoch)).plan, 'core')
})

test('failed renewal recovery, cancellation undo and terminal states use current subscription state', t => {
  t.mock.timers.enable({ apis: ['Date'], now: epoch })
  const renewal = subscription('past_due')
  renewal.latest_invoice = { billing_reason: 'subscription_cycle', created: epoch / 1000,
    status_transitions: { finalized_at: epoch / 1000 } } as Stripe.Invoice
  const grace = subscriptionAccessRecord(renewal, [price])!.grant
  assert.equal(resolveAccess([grace], true, new Date(epoch + 72 * 3600_000 - 1)).plan, 'plus')
  assert.equal(resolveAccess([grace], true, new Date(epoch + 72 * 3600_000)).plan, 'core')
  const recovered = subscriptionAccessRecord(subscription('active', epoch / 1000 + 30 * 86400), [price])!.grant
  assert.equal(resolveAccess([recovered], true, new Date(epoch + 73 * 3600_000)).plan, 'plus')
  // Undoing a scheduled cancellation restores normal renewal semantics; a
  // fully canceled subscription must not be revived by a local UI action.
  assert.equal(resolveAccess([{ ...recovered, metadata: { ...recovered.metadata, cancel_at_period_end: false } }], true).plan, 'plus')
  for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const) {
    assert.equal(resolveAccess([subscriptionAccessRecord(subscription(status), [price])!.grant], true).plan, 'core', status)
  }
})

test('continuity preserves only the original six-hour window and cannot refresh itself', () => {
  const secret = 'local-continuity-fixture-'.repeat(2)
  const access = { ...resolveAccess([], false), billingEnabled: true, source: 'subscription' as const }
  const token = signContinuity(user, access, secret, epoch)!
  const preserved = verifyContinuity(token, user, secret, epoch + CONTINUITY_SECONDS * 1000 - 1)!
  assert.equal(preserved.plan, 'plus')
  assert.equal(signContinuity(user, preserved, secret, epoch + 3600_000), null)
  assert.equal(verifyContinuity(token, user, secret, epoch + CONTINUITY_SECONDS * 1000), null)
  assert.equal(verifyContinuity(token, 'different-user', secret, epoch), null)
})
