import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { founderMetrics, type FounderDays } from './metrics'

export const founderHeaders = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' }
export async function founderSession() {
  if (process.env.ARIZE_EDITION === 'student') return { ok: false as const, status: 404, error: 'Not found.' }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { ok: false as const, status: 503, error: 'Founder reporting is not configured.' }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false as const, status: 401, error: 'Please sign in.' }
  const permission = await supabase.rpc('founder_dashboard_allowed').abortSignal(AbortSignal.timeout(8_000))
  if (permission.error) return { ok: false as const, status: 503, error: 'Founder reporting is not installed or is temporarily unavailable.' }
  if (permission.data !== true) return { ok: false as const, status: 403, error: 'Verified Founder access is required. Complete MFA if enrolled.' }
  return { ok: true as const, supabase }
}
export async function loadFounderMetrics(session: Extract<Awaited<ReturnType<typeof founderSession>>, { ok: true }>, days: FounderDays) {
  const mode = process.env.STRIPE_EXPECTED_MODE
  if (mode !== 'test' && mode !== 'live') return null
  const result = await session.supabase.rpc('founder_dashboard', { p_days: days, p_livemode: mode === 'live' }).abortSignal(AbortSignal.timeout(8_000))
  if (result.error) return null
  try { return founderMetrics(result.data, days, mode) } catch { return null }
}
