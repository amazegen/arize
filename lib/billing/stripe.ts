import 'server-only'

import Stripe from 'stripe'
import { billingConfigErrors } from './config'

export const STRIPE_API_VERSION = '2026-10-28.endive' as const
export const STRIPE_CHECKOUT_INTEGRATION_ID = 'arize_checkout_kqmdtavn'

export type BillingPeriod = 'monthly' | 'annual'

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required billing configuration: ${name}`)
  return value
}

function stripeSecretKey() {
  const value = process.env.ARIZE_STRIPE_SECRET_KEY?.trim()
  if (!value) throw new Error('Missing required billing configuration: ARIZE_STRIPE_SECRET_KEY')
  return value
}

export function isStripeCheckoutEnabled() {
  return process.env.STRIPE_CHECKOUT_ENABLED?.trim().toLowerCase() === 'true'
}

export function isStripeCheckoutConfigured() {
  return isStripeCheckoutEnabled() && billingConfigErrors(process.env).length === 0
}

export function getStripe() {
  const secretKey = stripeSecretKey()
  const expectedMode = requiredEnv('STRIPE_EXPECTED_MODE')
  if (expectedMode !== 'live' && expectedMode !== 'test') throw new Error('Invalid Stripe mode')
  const keyIsLive = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')
  const keyIsTest = secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')
  if ((expectedMode === 'test' && !keyIsTest) || (expectedMode === 'live' && !keyIsLive)) {
    throw new Error('Stripe secret key mode does not match this deployment')
  }

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: {
      name: 'Arize',
      version: '0.1.0',
      url: 'https://arize-gamma.vercel.app',
    },
    maxNetworkRetries: 1,
    timeout: 8_000,
  })
}

export async function assertExpectedStripeAccount(stripe: Stripe) {
  const expectedAccountId = requiredEnv('STRIPE_EXPECTED_ACCOUNT_ID')
  const account = await stripe.accounts.retrieveCurrent()
  if (account.id !== expectedAccountId) {
    throw new Error('Stripe key belongs to the wrong account')
  }
}

export function getStripePriceId(period: BillingPeriod) {
  return period === 'annual'
    ? requiredEnv('STRIPE_PRICE_ANNUAL')
    : requiredEnv('STRIPE_PRICE_MONTHLY')
}

export function getConfiguredStripePriceIds() {
  return [
    process.env.STRIPE_PRICE_MONTHLY?.trim(),
    process.env.STRIPE_PRICE_ANNUAL?.trim(),
  ].filter((value): value is string => Boolean(value))
}

export function getPublicAppUrl() {
  const configured = requiredEnv('NEXT_PUBLIC_APP_URL')
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS')
  }
  return url.origin
}

export function assertExpectedStripeMode(livemode: boolean) {
  const expected = requiredEnv('STRIPE_EXPECTED_MODE')
  if (expected !== 'test' && expected !== 'live') {
    throw new Error('STRIPE_EXPECTED_MODE must be test or live')
  }
  if (livemode !== (expected === 'live')) {
    throw new Error('Stripe event mode does not match this deployment')
  }
}
