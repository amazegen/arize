import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { checkoutWorkflow, portalWorkflow, deletionWorkflow, type DeletionStore } from '../lib/billing/workflows.ts'
import { processBillingWebhook, type WebhookStore } from '../lib/billing/webhook-workflow.ts'
import { billingConfigErrors } from '../lib/billing/config.ts'
import { sameOrigin, validBillingUrl, recentSignIn, validDeletionBody } from '../lib/billing/policy.ts'
import { resolveAccess } from '../lib/access/entitlements.ts'
import { signContinuity, verifyContinuity, CONTINUITY_SECONDS } from '../lib/access/continuity.ts'
import { billingBody } from '../lib/billing/http.ts'

const user = '0d6e5bed-2a98-4c8a-a588-6c835370513a'
const iter = async function* (items: unknown[]) { yield* items }
function fixture() {
  const calls: string[] = []
  let subscriptions: unknown[] = []
  let sessions: unknown[] = []
  let customer: string | null = 'cus_test'
  let locked = false
  let deleting = false
  let files = [{ bucket: 'village-audio', name: `${user}/owned.webm` }]
  let created: Stripe.Checkout.SessionCreateParams | undefined
  const store: DeletionStore = {
    async claim() { calls.push('claim'); if (locked) return false; locked = true; return true },
    async release() { calls.push('release'); locked = false },
    async isDeleting() { return deleting }, async customer() { return customer },
    async owner() { return user }, async saveCustomer(_user, id) { calls.push('saveCustomer'); customer = id },
    async beginDeletion() { deleting = true; calls.push('beginDeletion'); return 'job_1' },
    async stageDeletion(_job, stage, failed) { calls.push(`${stage}${failed ? ':failed' : ''}`) },
    async ownedStorage() { return files },
    async removeStorage(bucket, names) { calls.push('removeStorage'); assert.equal(bucket, 'village-audio'); assert.deepEqual(names, [`${user}/owned.webm`]); files = [] },
    async removeIdentity() { calls.push('removeIdentity') },
  }
  const api = {
    prices: { async retrieve(id: string) { return { id, active: true, livemode: false, currency: 'usd', unit_amount: id === 'price_annual' ? 1999 : 199, type: 'recurring', recurring: { interval: id === 'price_annual' ? 'year' : 'month', interval_count: 1, usage_type: 'licensed' }, product: { active: true } } } },
    customers: { async retrieve() { return { id: customer, livemode: false } }, async create() { calls.push('createCustomer'); return { id: 'cus_created' } }, async del() { calls.push('deleteCustomer') } },
    subscriptions: { list() { return iter(subscriptions) }, async cancel(id: string, params: unknown) { assert.deepEqual(params, { invoice_now: false, prorate: false }); calls.push(`cancel:${id}`) } },
    checkout: { sessions: { list() { return iter(sessions) }, async listLineItems() { return { data: [{ quantity: 1, price: { id: 'price_monthly' } }], has_more: false } }, async expire(id: string) { calls.push(`expire:${id}`) }, async create(params: Stripe.Checkout.SessionCreateParams) { created = params; calls.push('createSession'); return { url: 'https://checkout.stripe.com/c/pay_test' } } } },
    billingPortal: { configurations: { async retrieve() { return { active: true, livemode: false, features: { subscription_cancel: { enabled: true }, payment_method_update: { enabled: true } } } } }, sessions: { async create(params: { configuration: string }) { assert.equal(params.configuration, 'bpc_test'); return { url: 'https://billing.stripe.com/p/session/test' } } } },
  }
  return {
    store, api, calls, stripe: api as unknown as Stripe,
    subscriptions(value: unknown[]) { subscriptions = value }, sessions(value: unknown[]) { sessions = value },
    customer(value: string | null) { customer = value }, deleting() { deleting = true },
    get created() { return created }, get locked() { return locked },
  }
}
const checkout = (f: ReturnType<typeof fixture>, period: 'monthly' | 'annual' = 'monthly') => checkoutWorkflow({ stripe: f.stripe, store: f.store, userId: user, token: 'request-token', period, priceId: `price_${period}`, live: false, appUrl: 'https://arize.example', integrationId: 'arize_checkout_kqmdtavn' })

for (const period of ['monthly', 'annual'] as const) test(`${period} checkout requires card, correct price and first-customer trial`, async () => {
  const f = fixture(); f.customer(null)
  const result = await checkout(f, period)
  assert.equal(result.trial, true)
  assert.equal(f.created?.line_items?.[0].price, `price_${period}`)
  assert.equal(f.created?.payment_method_collection, 'always')
  assert.equal(f.created?.subscription_data?.trial_period_days, 7)
  assert.equal(f.created?.subscription_data?.trial_settings?.end_behavior.missing_payment_method, 'cancel')
  assert.ok(f.created && !('payment_method_types' in f.created))
  assert.ok(f.calls.indexOf('saveCustomer') < f.calls.indexOf('createSession'))
  assert.equal(f.locked, false)
})
test('a canceled previous subscription does not receive another trial', async () => {
  const f = fixture(); f.subscriptions([{ status: 'canceled', trial_start: 1 }])
  assert.equal((await checkout(f)).trial, false)
  assert.equal(f.created?.subscription_data?.trial_period_days, undefined)
})
test('new billing customer keeps the remainder of a longer complimentary early-member trial', async () => {
  const f = fixture(); const end = new Date(Date.now() + 12 * 24 * 60 * 60_000).toISOString()
  f.store.complimentaryTrialEnds = async () => end
  await checkout(f)
  assert.equal(f.created?.subscription_data?.trial_end, Math.ceil(Date.parse(end) / 1000))
  assert.equal(f.created?.subscription_data?.trial_period_days, undefined)
})
test('wrong amount/currency/mode cannot open checkout', async () => {
  for (const change of [{ unit_amount: 999 }, { currency: 'eur' }, { livemode: true }]) {
    const f = fixture(); const original = f.api.prices.retrieve
    f.api.prices.retrieve = async id => ({ ...await original(id), ...change })
    await assert.rejects(checkout(f), /approved membership offer/)
    assert.ok(!f.calls.includes('createSession'))
  }
})
test('billing JSON parser rejects oversized, malformed and non-object bodies', async () => {
  assert.deepEqual(await billingBody(new Request('https://arize.example', { method: 'POST', body: '{"period":"monthly"}' })), { period: 'monthly' })
  for (const body of ['x'.repeat(4097), 'not json', '[]', 'null']) await assert.rejects(billingBody(new Request('https://arize.example', { method: 'POST', body })))
})
test('active, trialing, past-due and incomplete subscriptions block duplicate checkout', async () => {
  for (const status of ['active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'paused']) {
    const f = fixture(); f.subscriptions([{ status }])
    await assert.rejects(checkout(f), /already have a subscription/)
    assert.ok(!f.calls.includes('createSession'))
    assert.equal(f.locked, false)
  }
})
test('open checkout is reused; changing period expires it before replacement', async () => {
  const f = fixture(); f.sessions([{ id: 'cs_old', mode: 'subscription', livemode: false, metadata: { arize_app: 'arize', arize_user_id: user, arize_billing_period: 'monthly', arize_trial: 'true' }, url: 'https://checkout.stripe.com/c/old' }])
  assert.equal((await checkout(f)).reused, true)
  assert.ok(!f.calls.includes('createSession'))
  await checkout(f, 'annual')
  assert.ok(f.calls.indexOf('expire:cs_old') < f.calls.indexOf('createSession'))
})
test('ambiguous provider failure retains lease; concurrent checkout must retry', async () => {
  const f = fixture(); f.api.checkout.sessions.create = async () => { throw new Error('timeout') }
  await assert.rejects(checkout(f), /timeout/)
  assert.equal(f.locked, true)
  await assert.rejects(checkout(f), /Another billing action/)
})
test('deleting accounts cannot checkout', async () => {
  const f = fixture(); f.deleting()
  await assert.rejects(checkout(f), /deletion/)
  assert.ok(!f.calls.includes('createSession'))
})
test('portal uses explicitly configured cancellation/payment-recovery settings', async () => {
  const f = fixture()
  assert.match(await portalWorkflow({ stripe: f.stripe, store: f.store, userId: user, configuration: 'bpc_test', live: false, appUrl: 'https://arize.example' }), /^https:\/\/billing.stripe.com/)
  f.api.billingPortal.configurations.retrieve = async () => ({ active: true, livemode: false, features: { subscription_cancel: { enabled: false }, payment_method_update: { enabled: true } } })
  await assert.rejects(portalWorkflow({ stripe: f.stripe, store: f.store, userId: user, configuration: 'bpc_test', live: false, appUrl: 'https://arize.example' }), /cancellation/)
})
test('deletion cancels subscriptions before storage and identity removal', async () => {
  const f = fixture(); f.subscriptions([{ id: 'sub_active', status: 'active' }, { id: 'sub_canceled', status: 'canceled' }])
  assert.deepEqual(await deletionWorkflow({ userId: user, token: 'token', store: f.store, stripeForCustomer: async () => f.stripe }), { deleted: true })
  assert.ok(f.calls.indexOf('cancel:sub_active') < f.calls.indexOf('removeStorage'))
  assert.ok(f.calls.indexOf('deleteCustomer') < f.calls.indexOf('removeIdentity'))
  assert.ok(!f.calls.includes('cancel:sub_canceled'))
})
test('billing cancellation failure stops deletion before app data is destroyed', async () => {
  const f = fixture(); f.subscriptions([{ id: 'sub_active', status: 'active' }])
  f.api.subscriptions.cancel = async () => { throw new Error('provider unavailable') }
  await assert.rejects(deletionWorkflow({ userId: user, token: 'token', store: f.store, stripeForCustomer: async () => f.stripe }), /unavailable/)
  assert.ok(!f.calls.includes('removeIdentity')); assert.ok(!f.calls.includes('removeStorage'))
  assert.ok(f.calls.includes('billing:failed'))
})
test('storage failure preserves identity for safe retry', async () => {
  const f = fixture(); f.store.removeStorage = async () => { throw new Error('storage unavailable') }
  await assert.rejects(deletionWorkflow({ userId: user, token: 'token', store: f.store, stripeForCustomer: async () => f.stripe }))
  assert.ok(!f.calls.includes('removeIdentity')); assert.ok(f.calls.includes('storage:failed'))
})
test('non-billing account deletion does not contact Stripe', async () => {
  const f = fixture(); f.customer(null)
  await deletionWorkflow({ userId: user, token: 'token', store: f.store, stripeForCustomer: async () => { throw new Error('Must not call Stripe') } })
  assert.ok(f.calls.includes('removeIdentity'))
})
test('final receipt failure after identity removal does not falsely report deletion failure', async () => {
  const f = fixture(); f.store.stageDeletion = async (_job, stage) => { if (stage === 'completed') throw new Error('receipt unavailable') }
  assert.deepEqual(await deletionWorkflow({ userId: user, token: 'token', store: f.store, stripeForCustomer: async () => f.stripe }), { deleted: true })
})

function event(type = 'customer.subscription.updated') { return { id: 'evt_test', type, livemode: false, data: { object: { id: 'sub_current' } } } as Stripe.Event }
function webhookFixture() {
  const calls: string[] = []
  const store: WebhookStore = { async claim() { return 'claimed' }, async finish(_id, _token, failure) { calls.push(failure ?? 'processed') }, async sync(id) { calls.push(id) }, async risk(_event, ids) { calls.push(`risk:${ids.join(',')}`) } }
  return { store, calls }
}
test('processed duplicate webhook is acknowledged without applying it again', async () => {
  const f = webhookFixture(); f.store.claim = async () => 'processed'
  assert.equal((await processBillingWebhook({} as Stripe, f.store, event(), 'token')).duplicate, true)
  assert.deepEqual(f.calls, [])
})
test('busy webhook is retried, not acknowledged as processed', async () => {
  const f = webhookFixture(); f.store.claim = async () => 'busy'
  await assert.rejects(processBillingWebhook({} as Stripe, f.store, event(), 'token'), /retry/)
  assert.deepEqual(f.calls, [])
})
test('webhook passes only subscription ID to current-state synchronization', async () => {
  const f = webhookFixture()
  await processBillingWebhook({} as Stripe, f.store, event(), 'token')
  assert.deepEqual(f.calls, ['sub_current', 'processed'])
})
test('failed renewal sync records retry, while success records processed', async () => {
  const f = webhookFixture(); f.store.sync = async () => { throw new Error('db unavailable') }
  const e = event('invoice.payment_failed'); e.data.object = { parent: { subscription_details: { subscription: 'sub_renewal' } } } as Stripe.Invoice
  await assert.rejects(processBillingWebhook({} as Stripe, f.store, e, 'token'))
  assert.deepEqual(f.calls, ['retry_required'])
})
test('refund/dispute/fraud signals resolve invoice subscription and queue review', async () => {
  for (const type of ['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created']) {
    const f = webhookFixture(); const e = event(type)
    e.data.object = { id: 'ch_test', charge: 'ch_test', payment_intent: 'pi_test' } as unknown as Stripe.Charge
    const stripe = { charges: { async retrieve() { return { payment_intent: 'pi_test' } } }, invoicePayments: { list() { return iter([{ invoice: { parent: { subscription_details: { subscription: 'sub_risk' } } } }]) } } } as unknown as Stripe
    await processBillingWebhook(stripe, f.store, e, 'token')
    assert.deepEqual(f.calls, ['risk:sub_risk', 'sub_risk', 'processed'])
  }
})

test('continuity is user-bound, signed, short-lived and never re-minted during outage', () => {
  const secret = 's'.repeat(32); const now = Date.now()
  const access = { ...resolveAccess([], false), billingEnabled: true, source: 'admin' as const }
  const token = signContinuity(user, access, secret, now)!
  assert.equal(verifyContinuity(token, user, secret, now)?.plan, 'plus')
  assert.equal(verifyContinuity(token, user, secret, now)?.source, 'admin')
  assert.equal(verifyContinuity(token, 'different-user', secret, now), null)
  assert.equal(verifyContinuity(token + 'x', user, secret, now), null)
  assert.equal(verifyContinuity(token, user, secret, now + CONTINUITY_SECONDS * 1000), null)
  assert.equal(signContinuity(user, { ...access, continuity: true }, secret, now), null)
  assert.equal(signContinuity(user, resolveAccess([], true), secret, now), null)
})
test('billing destinations, mutation origins and deletion confirmations are constrained', () => {
  assert.equal(validBillingUrl('https://checkout.stripe.com.evil.example/pay', 'checkout'), false)
  assert.equal(validBillingUrl('https://attacker@billing.stripe.com/p', 'portal'), false)
  assert.equal(sameOrigin(new Request('https://arize.example/api', { method: 'POST' })), false)
  assert.equal(sameOrigin(new Request('https://arize.example/api', { headers: { origin: 'https://evil.example' } })), false)
  assert.equal(sameOrigin(new Request('https://arize.example/api', { headers: { origin: 'https://arize.example' } })), true)
  assert.equal(recentSignIn(new Date().toISOString()), true)
  assert.equal(recentSignIn(new Date(Date.now() - 16 * 60_000).toISOString()), false)
  assert.equal(validDeletionBody({ confirmation: 'DELETE MY ACCOUNT', acknowledged: true }), true)
  assert.equal(validDeletionBody({ confirmation: 'delete', acknowledged: true }), false)
})
const config = { BILLING_ENFORCEMENT_ENABLED: 'true', STRIPE_CHECKOUT_ENABLED: 'true', NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED: 'true', STRIPE_EXPECTED_MODE: 'test', ARIZE_STRIPE_SECRET_KEY: 'rk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_fixture', STRIPE_PRICE_MONTHLY: 'price_monthly', STRIPE_PRICE_ANNUAL: 'price_annual', STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture', BILLING_ACCESS_SIGNING_SECRET: 'x'.repeat(32), NEXT_PUBLIC_APP_URL: 'https://arize.example' }
test('configuration gate rejects mixed modes, missing safeguards and live preview', () => {
  assert.deepEqual(billingConfigErrors(config), [])
  for (const change of [ { ARIZE_STRIPE_SECRET_KEY: 'rk_live_wrong' }, { STRIPE_PORTAL_CONFIGURATION_ID: '' }, { BILLING_ACCESS_SIGNING_SECRET: '' }, { NEXT_PUBLIC_APP_URL: 'https://arize.example/path' }, { STRIPE_CHECKOUT_ENABLED: 'false' }, { STRIPE_PRICE_ANNUAL: 'price_monthly' }, { VERCEL_ENV: 'preview', STRIPE_EXPECTED_MODE: 'live', ARIZE_STRIPE_SECRET_KEY: 'rk_live_fixture' } ]) assert.ok(billingConfigErrors({ ...config, ...change }).length > 0)
})
