import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertExpectedStripeAccount, getStripe } from '@/lib/billing/stripe'
import { billingStore } from '@/lib/billing/store'
import { deletionWorkflow, BillingWorkflowError } from '@/lib/billing/workflows'
import { NO_STORE, sameOrigin, recentSignIn, validDeletionBody } from '@/lib/billing/policy'
import { billingBody } from '@/lib/billing/http'
import { safeBillingError } from '@/lib/billing/safe-error'
import { CONTINUITY_COOKIE } from '@/lib/access/continuity'
export const runtime = 'nodejs'
export const maxDuration = 60
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return reply({ error: 'Please sign in.' }, 401)
  const result = await client.from('account_deletion_jobs').select('status,stage').eq('user_id', user.id).maybeSingle()
  if (result.error) return reply({ error: 'Deletion status is temporarily unavailable.' }, 503)
  return reply({ pending: Boolean(result.data), status: result.data?.status ?? null })
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Invalid request origin.' }, 403)
  try {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return reply({ error: 'Please sign in again.' }, 401)
    if (!recentSignIn(user.last_sign_in_at)) return reply({ error: 'For your security, sign out and sign in again, then return here within 15 minutes.', reauthenticate: true }, 403)
    if (!validDeletionBody(await billingBody(request))) return reply({ error: 'Type DELETE MY ACCOUNT and confirm the deletion notice.' }, 400)
    const admin = createAdminClient()
    await deletionWorkflow({ userId: user.id, token: randomUUID(), store: billingStore(admin), stripeForCustomer: async () => {
      const stripe = getStripe()
      await assertExpectedStripeAccount(stripe)
      return stripe
    } })
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    const response = reply({ deleted: true })
    response.cookies.set(CONTINUITY_COOKIE, '', { maxAge: 0, path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' })
    return response
  } catch (error) {
    console.error('[account deletion]', safeBillingError(error))
    return reply({ error: error instanceof BillingWorkflowError ? error.message : 'Deletion could not finish yet. Do not assume your account is deleted. Retry here; completed steps will not be repeated unnecessarily.' }, error instanceof BillingWorkflowError ? error.status : 503)
  }
}
