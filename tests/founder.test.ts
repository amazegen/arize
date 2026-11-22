import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type Stripe from 'stripe'
import { founderDays, founderMetrics, conversionRate, chartPoints, type FounderDays } from '../lib/founder/metrics.ts'
import { billingObservation, observeBillingSafely } from '../lib/founder/billing-observation.ts'

function sample(days: FounderDays = 7) {
  return {
    schemaVersion: 1, asOf: '2026-11-22T18:00:00Z', timeZone: 'America/New_York', days,
    fromDay: new Date(Date.parse('2026-11-23') - days * 86400000).toISOString().slice(0, 10), throughDay: '2026-11-22', billingMode: 'test',
    registrations: 0, registeredAccounts: 0, weeklyActiveUsers: 0, activeUsers: 0, checkIns: 0, claritySessions: 0,
    featureUsers: { checkIns: 0, clarity: 0, goals: 0, village: 0 }, billing: { monthly: 0, annual: 0, stripeTrials: 0, complimentaryTrials: 0, unclassified: 0 },
    conversion: { captureStartedAt: '2026-11-01T00:00:00Z', eligibleTrials: 0 as number | null, convertedTrials: 0 as number | null, missingCaptures: 0, pendingWebhooks: 0, lastWebhookAt: null as string | null },
    trend: Array.from({ length: days }, (_, i) => ({ day: new Date(Date.parse('2026-11-23') - (days - i) * 86400000).toISOString().slice(0, 10), registrations: 0, checkIns: 0, claritySessions: 0, weeklyActiveUsers: 0 })),
  }
}
function event(type = 'invoice.paid', fields: Record<string, unknown> = {}) {
  return { id: 'evt_fictional', type, created: 1795262400, livemode: false, data: { object: { id: 'in_fictional', amount_paid: 199, currency: 'usd', status: 'paid', status_transitions: { paid_at: 1795262400 }, parent: { subscription_details: { subscription: 'sub_fictional' } }, ...fields } } } as unknown as Stripe.Event
}
test('Founder date ranges are bounded and cannot carry alternate filters', () => {
  assert.equal(founderDays(undefined), 30); assert.equal(founderDays(null), 30)
  for (const n of ['7', '30', '90']) assert.equal(founderDays(n), Number(n))
  for (const v of ['', '0', '1000', '7.0', '07', ['7'], 7, {}, '30&mode=live']) assert.equal(founderDays(v), null)
})
test('aggregate DTO strips identifiers, private content and nested upstream records', () => {
  const v = { ...sample(), email: 'private@example.test', chats: [{ content: 'PRIVATE' }], userId: 'sensitive-id' }
  const result = founderMetrics(v, 7, 'test')
  assert.doesNotMatch(JSON.stringify(result), /private@|PRIVATE|sensitive-id|chats|email/)
  assert.equal(result.registrations, 0)
})
test('bad counts, modes, incomplete series and contradictory totals fail closed', () => {
  for (const value of [-1, NaN, Infinity, '1', null, 1.5]) assert.throws(() => founderMetrics({ ...sample(), registrations: value }, 7, 'test'))
  assert.throws(() => founderMetrics(sample(), 7, 'live'))
  assert.throws(() => founderMetrics({ ...sample(), trend: [] }, 7, 'test'))
  assert.throws(() => founderMetrics({ ...sample(), timeZone: 'UTC' }, 7, 'test'))
  assert.throws(() => founderMetrics({ ...sample(), checkIns: 1 }, 7, 'test'))
  const v = sample(); v.trend[1].day = v.trend[0].day
  assert.throws(() => founderMetrics(v, 7, 'test'))
})
test('unavailable conversion is not zero, and rates use cohort numerator/denominator', () => {
  const v = sample()
  assert.equal(conversionRate(v.conversion), null)
  v.conversion.eligibleTrials = 3; v.conversion.convertedTrials = 1
  assert.equal(conversionRate(v.conversion), 33.3)
  v.conversion.convertedTrials = 0; assert.equal(conversionRate(v.conversion), 0)
  v.conversion.missingCaptures = 1
  assert.throws(() => founderMetrics(v, 7, 'test'))
  v.conversion.eligibleTrials = null; v.conversion.convertedTrials = null
  assert.equal(conversionRate(founderMetrics(v, 7, 'test').conversion), null)
})
test('chart samples rolling snapshots without summing overlapping active users', () => {
  for (const n of [7, 30, 90] as const) {
    const data = founderMetrics(sample(n), n, 'test'), points = chartPoints(data.trend)
    assert.ok(points.length <= 15); assert.deepEqual(points.at(-1), data.trend.at(-1))
    assert.ok(points.every(p => data.trend.includes(p)))
  }
})
test('only positive paid subscription USD invoices produce paid observations', () => {
  assert.equal(billingObservation(event()).subscriptionId, 'sub_fictional')
  assert.ok(billingObservation(event()).paidAt)
  for (const fields of [{ amount_paid: 0 }, { amount_paid: -1 }, { status: 'open' }, { currency: 'eur' }, { parent: null }]) assert.equal(billingObservation(event('invoice.paid', fields)).paidAt, null)
  for (const type of ['invoice.payment_failed', 'checkout.session.completed', 'customer.subscription.updated', 'charge.refunded']) assert.equal(billingObservation(event(type)).paidAt, null)
  assert.equal(billingObservation(event('invoice.paid', { status_transitions: { paid_at: 99999999999 } })).paidAt, null)
})
test('reporting failures never change the successful billing result and include no event payload', async () => {
  assert.equal(await observeBillingSafely(event(), async () => { throw new Error('private provider failure') }), false)
  let fields: unknown
  assert.equal(await observeBillingSafely(event('invoice.paid', { customer_email: 'private@example.test' }), async o => { fields = o }), true)
  assert.deepEqual(Object.keys(fields as object).sort(), ['eventId', 'paidAt', 'subscriptionId'])
  assert.doesNotMatch(JSON.stringify(fields), /private@|amount_paid|customer_email/)
})
test('Founder surfaces remain adult-only, no-store, aggregate-only and independent of Student credentials', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  assert.match(read('lib/founder/server.ts'), /ARIZE_EDITION === 'student'/)
  assert.match(read('lib/founder/server.ts'), /private, no-store/)
  assert.match(read('app/api/admin/founder/route.ts'), /not_connected/)
  assert.doesNotMatch(read('lib/founder/server.ts'), /SUPABASE_SERVICE_ROLE|STUDENT_.*KEY|stripe\./)
  assert.match(read('components/founder/FounderDashboard.tsx'), /Not connected/)
  const webhook = read('app/api/billing/webhook/route.ts')
  assert.ok(webhook.indexOf('observeBillingSafely(event') > webhook.indexOf('processBillingWebhook(stripe'))
  assert.match(webhook, /AbortSignal\.timeout\(1_500\)/)
  assert.doesNotMatch(webhook, /console\.(?:log|warn|error)\([^\n]*event\.data/)
})
