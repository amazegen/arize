import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { bearer, nativeEnabled, nativeHeaders, nativeOrigin } from './policy'
import { UUID, type NativeProfile } from './contracts'
import { getUserAccess } from '../access/server'

export class NativeError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}
export function nativeReply(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: nativeHeaders(request, process.env) })
}
export async function nativeSession(request: Request, ready = true) {
  if (!nativeEnabled(process.env)) throw new NativeError('unavailable','Not found.',404)
  if (!nativeOrigin(request.headers.get('origin'),process.env)) throw new NativeError('origin','This application origin is not allowed.',403)
  const token = bearer(request)
  if (!token) throw new NativeError('sign_in','Please sign in again.',401)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new NativeError('unavailable','Account services are not configured.',503)
  const supabase = createClient(url,key,{ global: { headers: { Authorization:`Bearer ${token}` }, fetch: (input,init) => fetch(input,{...init,signal:AbortSignal.timeout(10_000)}) }, auth: { persistSession:false,autoRefreshToken:false,detectSessionInUrl:false } })
  const { data:{user},error } = await supabase.auth.getUser(token)
  if (error || !user || user.is_anonymous || !user.email_confirmed_at) throw new NativeError('sign_in','Sign in with your verified Arize account.',401)
  const result = await supabase.rpc('native_session_context')
  if (result.error) throw new NativeError('unavailable','Native account checks are not installed or temporarily unavailable.',503)
  const ctx = result.data
  if (!ctx || !UUID.test(ctx.sessionId ?? '') || typeof ctx.startedAt !== 'string' || !ctx.profile || typeof ctx.profile.onboarded !== 'boolean') throw new NativeError('sign_in','Your session expired or was signed out. Please sign in again.',401)
  for (const field of ['consented','aiConsented','deleting','needsMfa']) if (typeof ctx[field] !== 'boolean') throw new NativeError('unavailable','Account checks unavailable.',503)
  if (ready) {
    if (ctx.needsMfa) throw new NativeError('mfa','Complete your account’s second verification step.',403)
    if (ctx.deleting) throw new NativeError('deleting','Your account deletion is pending.',409)
    if (!ctx.consented || !ctx.profile.onboarded) throw new NativeError('setup','Complete account setup first.',403)
  }
  const access = await getUserAccess(supabase,user.id,{ continuityToken:request.headers.get('x-arize-continuity') ?? undefined })
  return { supabase,user,access,context: { sessionId:String(ctx.sessionId),startedAt:String(ctx.startedAt),profile:ctx.profile as NativeProfile,consented:Boolean(ctx.consented),aiConsented:Boolean(ctx.aiConsented),deleting:Boolean(ctx.deleting),needsMfa:Boolean(ctx.needsMfa) } }
}
export function nativeAdmin() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || process.env.ARIZE_EDITION === 'student') throw new NativeError('unavailable','Account services unavailable.',503)
  return createClient(url,key,{ global: { fetch: (input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10_000)}) },auth:{persistSession:false,autoRefreshToken:false} })
}
export function checked<T>({data,error}:{data:T;error:{code?:string}|null}):T {
  if (error) throw new NativeError(error.code==='23505'?'conflict':'storage',error.code==='23505'?'That value is already in use.':'The change could not be saved. Check your connection or account limits.',error.code==='23505'?409:503)
  return data
}
