export type BillingEnvironment = Record<string, string | undefined>

export function billingConfigErrors(env: BillingEnvironment) {
  const errors: string[] = []
  for (const flag of ['BILLING_ENFORCEMENT_ENABLED', 'STRIPE_CHECKOUT_ENABLED', 'NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED']) {
    if (!['true', 'false'].includes(env[flag] ?? '')) errors.push(`${flag} must be exactly true or false`)
  }
  const checkout = env.STRIPE_CHECKOUT_ENABLED === 'true'
  const enforce = env.BILLING_ENFORCEMENT_ENABLED === 'true'
  if (checkout !== (env.NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED === 'true')) errors.push('Checkout flags must match')
  if (enforce && !checkout) errors.push('Membership enforcement requires available checkout')
  if (!checkout && !enforce) return errors
  const mode = env.STRIPE_EXPECTED_MODE
  if (!['test', 'live'].includes(mode ?? '')) errors.push('STRIPE_EXPECTED_MODE must be test or live')
  if (!env.ARIZE_STRIPE_SECRET_KEY?.startsWith(`rk_${mode}_`)) errors.push('Use a mode-matched restricted Stripe key')
  for (const [key, prefix] of [
    ['STRIPE_EXPECTED_ACCOUNT_ID', 'acct_'], ['STRIPE_PRICE_MONTHLY', 'price_'],
    ['STRIPE_PRICE_ANNUAL', 'price_'], ['STRIPE_PORTAL_CONFIGURATION_ID', 'bpc_'],
    ['STRIPE_WEBHOOK_SECRET', 'whsec_'],
  ]) if (!env[key]?.startsWith(prefix)) errors.push(`${key} is missing or invalid`)
  if (env.STRIPE_PRICE_MONTHLY === env.STRIPE_PRICE_ANNUAL) errors.push('Monthly and annual prices must differ')
  if (!env.SUPABASE_SERVICE_ROLE_KEY) errors.push('SUPABASE_SERVICE_ROLE_KEY is required')
  if (enforce && (env.BILLING_ACCESS_SIGNING_SECRET?.length ?? 0) < 32) errors.push('Membership continuity needs a server-only signing secret of at least 32 characters')
  try {
    const url = new URL(env.NEXT_PUBLIC_APP_URL ?? '')
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('origin')
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('https')
  } catch { errors.push('NEXT_PUBLIC_APP_URL must be an HTTPS origin (local HTTP allowed only on loopback)') }
  if (env.VERCEL_ENV === 'preview' && mode === 'live') errors.push('Preview deployments must never use live Stripe')
  return errors
}
