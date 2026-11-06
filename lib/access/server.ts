import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveAccess,
  type AccessGrantRecord,
  type AccessSnapshot,
} from './entitlements'
import { safeBillingError } from '@/lib/billing/safe-error'
import { cookies } from 'next/headers'
import { CONTINUITY_COOKIE, verifyContinuity } from './continuity'

export function isBillingEnforcementEnabled() {
  return process.env.BILLING_ENFORCEMENT_ENABLED?.trim().toLowerCase() === 'true'
}

export async function getUserAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessSnapshot> {
  const billingEnabled = isBillingEnforcementEnabled()
  if (!billingEnabled) return resolveAccess([], false)

  async function unavailable() {
    const token = (await cookies()).get(CONTINUITY_COOKIE)?.value
    return verifyContinuity(token, userId, process.env.BILLING_ACCESS_SIGNING_SECRET ?? '')
      ?? { ...resolveAccess([], true), temporarilyUnavailable: true }
  }

  const rollout = await supabase.rpc('membership_rollout_state')
  if (rollout.error || !rollout.data) return unavailable()
  if (rollout.data.enabled !== true) return resolveAccess([], false)
  if (rollout.data.stripeMode !== process.env.STRIPE_EXPECTED_MODE) return unavailable()

  const { data, error } = await supabase
    .from('access_grants')
    .select('plan, source, status, starts_at, ends_at, metadata')
    .eq('user_id', userId)
    .in('status', ['active', 'scheduled'])
    .order('starts_at', { ascending: false })
    .limit(20)

  if (error) {
    // Only a signed, user-bound recent snapshot can preserve paid access during
    // an outage. Unknown users never receive speculative Plus access.
    console.error('[membership access]', safeBillingError(error))
    return unavailable()
  }

  const grants = ((data ?? []) as AccessGrantRecord[]).filter(grant =>
    !['subscription', 'checkout_trial'].includes(grant.source)
    || grant.metadata?.livemode === (process.env.STRIPE_EXPECTED_MODE === 'live'))
  return resolveAccess(grants, true)
}
