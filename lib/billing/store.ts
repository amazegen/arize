import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeletionStore } from './workflows'

function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

export function billingStore(admin: SupabaseClient): DeletionStore {
  return {
    async claim(userId, token) {
      return checked(await admin.rpc('claim_billing_operation', { p_user: userId, p_token: token })) === true
    },
    async release(userId, token) { checked(await admin.rpc('release_billing_operation', { p_user: userId, p_token: token })) },
    async isDeleting(userId) {
      return Boolean(checked(await admin.from('account_deletion_jobs').select('id').eq('user_id', userId).maybeSingle()))
    },
    async customer(userId) {
      const row = checked(await admin.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle())
      return row?.stripe_customer_id ?? null
    },
    async owner(customerId) {
      const row = checked(await admin.from('billing_customers').select('user_id').eq('stripe_customer_id', customerId).maybeSingle())
      return row?.user_id ?? null
    },
    async saveCustomer(userId, customerId) {
      checked(await admin.from('billing_customers').insert({ user_id: userId, stripe_customer_id: customerId }))
    },
    async complimentaryTrialEnds(userId) {
      const rows = checked(await admin.from('access_grants').select('ends_at').eq('user_id', userId).eq('source', 'early_member_trial').eq('status', 'active').lte('starts_at', new Date().toISOString()).gt('ends_at', new Date().toISOString()).order('ends_at', { ascending: false }).limit(1))
      return rows?.[0]?.ends_at ?? null
    },
    async beginDeletion(userId) {
      const existing = checked(await admin.from('account_deletion_jobs').select('id').eq('user_id', userId).maybeSingle())
      if (existing) return existing.id
      const created = checked(await admin.from('account_deletion_jobs').insert({ user_id: userId }).select('id').single())
      if (!created) throw new Error('Deletion job was not created')
      return created.id
    },
    async stageDeletion(job, stage, failed = false) {
      checked(await admin.from('account_deletion_jobs').update({ stage, status: stage === 'completed' ? 'completed' : failed ? 'retry_required' : 'processing', updated_at: new Date().toISOString() }).eq('id', job))
    },
    async ownedStorage(userId) {
      return checked(await admin.rpc('billing_owned_storage_page', { p_user: userId })) as { bucket: string; name: string }[]
    },
    async removeStorage(bucket, names) { checked(await admin.storage.from(bucket).remove(names)) },
    async removeIdentity(userId) {
      const result = await admin.auth.admin.deleteUser(userId)
      if (result.error) throw result.error
    },
  }
}
