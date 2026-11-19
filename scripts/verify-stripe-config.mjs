// READ ONLY: no Stripe create/update/delete operations; no secret values logged.
import Stripe from 'stripe'
import { billingConfigErrors } from '../lib/billing/config.ts'
import { assertPrice, BILLING_EVENTS } from '../lib/billing/policy.ts'
import { safeBillingError } from '../lib/billing/safe-error.ts'

const errors = billingConfigErrors({ ...process.env, STRIPE_CHECKOUT_ENABLED: 'true', NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED: 'true', BILLING_ENFORCEMENT_ENABLED: 'true' })
if (errors.length) {
  for (const error of errors) console.error(error)
  process.exitCode = 1
} else {
  try {
    const stripe = new Stripe(process.env.ARIZE_STRIPE_SECRET_KEY, { apiVersion: '2026-10-28.endive', timeout: 8000, maxNetworkRetries: 1 })
    const account = await stripe.accounts.retrieveCurrent()
    if (account.id !== process.env.STRIPE_EXPECTED_ACCOUNT_ID) throw new Error('Wrong Stripe account')
    const live = process.env.STRIPE_EXPECTED_MODE === 'live'
    for (const [period, id] of [['monthly', process.env.STRIPE_PRICE_MONTHLY], ['annual', process.env.STRIPE_PRICE_ANNUAL]]) assertPrice(await stripe.prices.retrieve(id, { expand: ['product'] }), period, live)
    const portal = await stripe.billingPortal.configurations.retrieve(process.env.STRIPE_PORTAL_CONFIGURATION_ID)
    if (!portal.active || portal.livemode !== live || !portal.features.subscription_cancel?.enabled || !portal.features.payment_method_update?.enabled) throw new Error('Portal must support cancellation and payment recovery')
    const expectedUrl = new URL('/api/billing/webhook', process.env.NEXT_PUBLIC_APP_URL).href
    let endpoint
    for await (const item of stripe.webhookEndpoints.list({ limit: 100 })) if (item.url === expectedUrl && item.livemode === live && item.status === 'enabled') endpoint = item
    if (!endpoint || endpoint.api_version !== '2026-10-28.endive' || !BILLING_EVENTS.every(type => endpoint.enabled_events.includes('*') || endpoint.enabled_events.includes(type))) throw new Error('Webhook URL, event list or pinned API version does not match')
    console.log('Read-only account, price, portal and webhook configuration checks passed.')
    console.log('This does not prove webhook-secret correctness, card checkout, payment recovery or production access. Run the sandbox acceptance checklist separately.')
  } catch (error) {
    console.error('Read-only Stripe verification failed.', safeBillingError(error))
    process.exitCode = 1
  }
}
