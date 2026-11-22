import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { PushStore } from './policy'

export function pushStore(): PushStore {
  if (process.env.ARIZE_EDITION === 'student') throw new Error('Adult only')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Reminder storage unavailable')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return { async call(name, args) {
    const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.timeout(8_000))
    if (error) throw new Error('Reminder storage unavailable')
    return data
  } }
}
