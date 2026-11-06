import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { assertExpectedStripeAccount, getPublicAppUrl, getStripe, getStripePriceId, isStripeCheckoutConfigured, STRIPE_CHECKOUT_INTEGRATION_ID } from '@/lib/billing/stripe'
import { safeBillingError } from '@/lib/billing/safe-error'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/consent'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NO_STORE, sameOrigin } from '@/lib/billing/policy'
import { billingBody } from '@/lib/billing/http'
import { billingStore } from '@/lib/billing/store'
import { checkoutWorkflow, BillingWorkflowError } from '@/lib/billing/workflows'

export const runtime = 'nodejs'
export const maxDuration = 60
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Invalid request origin.' }, 403)
  if (!isStripeCheckoutConfigured()) return reply({ error: 'Membership checkout is not available yet.' }, 503)
  try {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return reply({ error: 'Please sign in again.' }, 401)
    if (!user.email_confirmed_at) return reply({ error: 'Confirm your email before checkout.' }, 403)
    const { data: consent, error } = await client.from('legal_consents').select('id').eq('user_id', user.id)
      .eq('terms_version', TERMS_VERSION).eq('privacy_version', PRIVACY_VERSION).maybeSingle()
    if (error) throw error
    if (!consent) return reply({ error: 'Please accept the current Terms and Privacy Policy first.' }, 403)
    const body = await billingBody(request)
    if (body.period !== 'monthly' && body.period !== 'annual') return reply({ error: 'Choose a valid billing period.' }, 400)
    const key = request.headers.get('x-idempotency-key')
    const token = key && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key) ? key : randomUUID()
    const stripe = getStripe()
    await assertExpectedStripeAccount(stripe)
    return reply(await checkoutWorkflow({ stripe, store: billingStore(createAdminClient()), userId: user.id,
      email: user.email, token, period: body.period, priceId: getStripePriceId(body.period),
      live: process.env.STRIPE_EXPECTED_MODE === 'live', appUrl: getPublicAppUrl(), integrationId: STRIPE_CHECKOUT_INTEGRATION_ID }))
  } catch (error) {
    console.error('[billing checkout]', safeBillingError(error))
    return reply({ error: error instanceof BillingWorkflowError ? error.message : 'Unable to prepare checkout safely. Wait a moment, then try again.' }, error instanceof BillingWorkflowError ? error.status : 502)
  }
}
