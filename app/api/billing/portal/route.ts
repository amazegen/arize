import { NextResponse } from 'next/server'
import { safeBillingError } from '@/lib/billing/safe-error'
import { assertExpectedStripeAccount, getPublicAppUrl, getStripe } from '@/lib/billing/stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NO_STORE, sameOrigin } from '@/lib/billing/policy'
import { billingStore } from '@/lib/billing/store'
import { BillingWorkflowError, portalWorkflow } from '@/lib/billing/workflows'
export const runtime = 'nodejs'
export const maxDuration = 60
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Invalid request origin.' }, 403)
  try {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return reply({ error: 'Please sign in again.' }, 401)
    const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim()
    if (!configuration?.startsWith('bpc_')) return reply({ error: 'Billing management is not configured yet.' }, 503)
    // Keep cancellation/payment recovery available even if new checkout is paused.
    const stripe = getStripe()
    await assertExpectedStripeAccount(stripe)
    const url = await portalWorkflow({ stripe, store: billingStore(createAdminClient()), userId: user.id,
      configuration, appUrl: getPublicAppUrl(), live: process.env.STRIPE_EXPECTED_MODE === 'live' })
    return reply({ url })
  } catch (error) {
    console.error('[billing portal]', safeBillingError(error))
    return reply({ error: error instanceof BillingWorkflowError ? error.message : 'Unable to open billing management. Please try again.' }, error instanceof BillingWorkflowError ? error.status : 502)
  }
}
