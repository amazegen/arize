import type Stripe from 'stripe'
import { assertPrice, hasBillableSubscription, newTrialEligible, validBillingUrl, type BillingPeriod } from './policy.ts'

export class BillingWorkflowError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 503) { super(message); this.code = code; this.status = status }
}

export interface BillingStore {
  claim(userId: string, token: string): Promise<boolean>
  release(userId: string, token: string): Promise<void>
  isDeleting(userId: string): Promise<boolean>
  customer(userId: string): Promise<string | null>
  saveCustomer(userId: string, customerId: string): Promise<void>
  owner(customerId: string): Promise<string | null>
  complimentaryTrialEnds?(userId: string): Promise<string | null>
}

export async function checkoutWorkflow(input: {
  stripe: Stripe; store: BillingStore; userId: string; email?: string; token: string;
  period: BillingPeriod; priceId: string; live: boolean; appUrl: string; integrationId: string;
}) {
  const { stripe, store, userId, token, period } = input
  if (!await store.claim(userId, token)) throw new BillingWorkflowError('BILLING_BUSY', 'Another billing action is finishing. Wait a moment and try again.', 409)
  let release = false
  try {
    if (await store.isDeleting(userId)) {
      release = true
      throw new BillingWorkflowError('ACCOUNT_DELETING', 'Finish your account-deletion request before changing billing.', 409)
    }
    const price = await stripe.prices.retrieve(input.priceId, { expand: ['product'] })
    assertPrice(price, period, input.live)
    let customerId = await store.customer(userId)
    if (!customerId) {
      const customer = await stripe.customers.create({
        ...(input.email ? { email: input.email } : {}), metadata: { arize_app: 'arize', arize_user_id: userId },
      }, { idempotencyKey: `arize_customer_${userId}` })
      customerId = customer.id
      await store.saveCustomer(userId, customerId)
    }
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted || customer.livemode !== input.live) throw new Error('Customer configuration mismatch')
    const subscriptions: Stripe.Subscription[] = []
    for await (const item of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) subscriptions.push(item)
    if (subscriptions.some(item => hasBillableSubscription(item.status))) {
      release = true
      throw new BillingWorkflowError('ALREADY_SUBSCRIBED', 'You already have a subscription. Use Manage membership instead.', 409)
    }
    const trial = newTrialEligible(subscriptions)
    // Reuse an open checkout after an ambiguous network response instead of
    // creating another trial/subscription. A period switch expires the old one.
    for await (const session of stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 })) {
      if (session.mode !== 'subscription' || session.metadata?.arize_app !== 'arize') continue
      if (session.metadata.arize_user_id !== userId) throw new Error('Checkout owner mismatch')
      const lines = await stripe.checkout.sessions.listLineItems(session.id, { expand: ['data.price.product'], limit: 100 })
      const matchesPrice = lines.data.length === 1 && !lines.has_more && lines.data[0].quantity === 1 && lines.data[0].price?.id === input.priceId
      if (session.livemode === input.live && matchesPrice && session.metadata.arize_trial === String(trial)
        && session.metadata.arize_billing_period === period && validBillingUrl(session.url, 'checkout')) {
        release = true
        return { url: session.url!, trial: session.metadata.arize_trial === 'true', reused: true }
      }
      await stripe.checkout.sessions.expire(session.id)
    }
    const complimentaryEnd = trial && store.complimentaryTrialEnds ? Date.parse(await store.complimentaryTrialEnds(userId) ?? '') : NaN
    const extendedTrial = trial && complimentaryEnd > Date.now() + 7 * 24 * 60 * 60_000
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', origin_context: 'web', integration_identifier: input.integrationId,
      managed_payments: { enabled: false }, customer: customerId, client_reference_id: userId,
      line_items: [{ price: input.priceId, quantity: 1 }], payment_method_collection: 'always',
      subscription_data: {
        ...(trial ? { ...(extendedTrial ? { trial_end: Math.ceil(complimentaryEnd / 1000) } : { trial_period_days: 7 }), trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } } } : {}),
        metadata: { arize_app: 'arize', arize_user_id: userId, arize_plan: 'plus', arize_billing_period: period },
      },
      metadata: { arize_app: 'arize', arize_user_id: userId, arize_plan: 'plus', arize_billing_period: period, arize_trial: String(trial) },
      success_url: `${input.appUrl}/upgrade?checkout=success`, cancel_url: `${input.appUrl}/upgrade?checkout=canceled`,
    }, { idempotencyKey: `arize_checkout_${userId}_${period}_${token}` })
    if (!validBillingUrl(session.url, 'checkout')) throw new Error('Unexpected checkout destination')
    release = true
    return { url: session.url!, trial, reused: false }
  } finally {
    // An uncertain provider failure retains the 90-second lease. This gives a
    // timed-out creation time to settle before a second browser starts another.
    if (release) await store.release(userId, token)
  }
}

export async function portalWorkflow(input: {
  stripe: Stripe; store: BillingStore; userId: string; configuration: string; appUrl: string; live: boolean;
}) {
  if (await input.store.isDeleting(input.userId)) throw new BillingWorkflowError('ACCOUNT_DELETING', 'Your deletion request is already being processed.', 409)
  const customer = await input.store.customer(input.userId)
  if (!customer) throw new BillingWorkflowError('NO_CUSTOMER', 'No billing profile was found for this account.', 404)
  const config = await input.stripe.billingPortal.configurations.retrieve(input.configuration)
  if (!config.active || config.livemode !== input.live || !config.features.subscription_cancel?.enabled || !config.features.payment_method_update?.enabled) {
    throw new Error('Billing portal must support cancellation and payment updates')
  }
  const session = await input.stripe.billingPortal.sessions.create({ customer, configuration: input.configuration, return_url: `${input.appUrl}/upgrade` })
  if (!validBillingUrl(session.url, 'portal')) throw new Error('Unexpected billing portal destination')
  return session.url
}

export interface DeletionStore extends BillingStore {
  beginDeletion(userId: string): Promise<string>
  stageDeletion(job: string, stage: 'billing' | 'storage' | 'account' | 'completed', failed?: boolean): Promise<void>
  ownedStorage(userId: string): Promise<{ bucket: string; name: string }[]>
  removeStorage(bucket: string, names: string[]): Promise<void>
  removeIdentity(userId: string): Promise<void>
}

export async function deletionWorkflow(input: {
  userId: string; token: string; store: DeletionStore; stripeForCustomer: () => Promise<Stripe>;
}) {
  const { userId, token, store } = input
  if (!await store.claim(userId, token)) throw new BillingWorkflowError('BILLING_BUSY', 'A billing action is finishing. Please retry in a moment.', 409)
  let job: string | undefined
  let stage: 'billing' | 'storage' | 'account' = 'billing'
  let identityRemoved = false
  try {
    job = await store.beginDeletion(userId)
    const customerId = await store.customer(userId)
    if (customerId) {
      const stripe = await input.stripeForCustomer()
      const customer = await stripe.customers.retrieve(customerId)
      if (!customer.deleted) {
        for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
          if (hasBillableSubscription(subscription.status)) {
            await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false })
          }
        }
        // Stripe retains financial records under its applicable retention rules;
        // deletion removes the reusable customer/payment-method profile.
        await stripe.customers.del(customerId)
      }
    }
    stage = 'storage'
    await store.stageDeletion(job, stage)
    for (let page = 0; page < 100; page++) {
      const files = await store.ownedStorage(userId)
      if (!files.length) break
      for (const bucket of new Set(files.map(item => item.bucket))) {
        await store.removeStorage(bucket, files.filter(item => item.bucket === bucket).map(item => item.name))
      }
      if (page === 99) throw new Error('More storage remains; retry deletion to continue')
    }
    stage = 'account'
    await store.stageDeletion(job, stage)
    // Auth -> profiles -> owned app records use explicit CASCADE foreign keys.
    await store.removeIdentity(userId)
    identityRemoved = true
    // Do not tell a user deletion failed merely because the final non-personal
    // job receipt cannot be updated after their identity has been removed.
    await store.stageDeletion(job, 'completed').catch(() => undefined)
    return { deleted: true }
  } catch (error) {
    if (job && !identityRemoved) await store.stageDeletion(job, stage, true).catch(() => undefined)
    throw error
  } finally {
    await store.release(userId, token).catch(() => undefined)
  }
}
