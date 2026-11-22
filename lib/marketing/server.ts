import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { MarketingStore } from './policy'

export function marketingStore(): MarketingStore {
  if (process.env.ARIZE_EDITION === 'student') throw new Error('Adult marketing only')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Marketing storage unavailable')
  const client = createClient(url,key,{ auth: { persistSession:false, autoRefreshToken:false } })
  return { async call(name,args) {
    const { data,error } = await client.rpc(name,args).abortSignal(AbortSignal.timeout(8_000))
    if (error) throw new Error('Marketing storage unavailable')
    return data
  } }
}
