import { randomUUID } from 'node:crypto'
import { nativeSession, nativeReply, NativeError, checked, nativeAdmin } from '@/lib/native/server'
import { nativeBody, nativeEnabled, nativeOrigin, bearer } from '@/lib/native/policy'
import { nativeGoals, nativeVillage, nativeCoach } from '@/lib/native/features'
import { signContinuity } from '@/lib/access/continuity'
import { getUsernameError, normalizeUsername } from '@/lib/profile/username'
import { NATIVE_AI_DISCLOSURE } from '@/lib/native/contracts'
import { validDeletionBody, recentSignIn } from '@/lib/billing/policy'
import { deletionWorkflow } from '@/lib/billing/workflows'
import { billingStore } from '@/lib/billing/store'
import { getStripe, assertExpectedStripeAccount } from '@/lib/billing/stripe'

export const runtime='nodejs'
export const maxDuration=60
type Context={params:Promise<{path:string[]}>}
export async function OPTIONS(request: Request) {
  if (!nativeEnabled(process.env)) return nativeReply(request,{error:'Not found.'},404)
  if (!nativeOrigin(request.headers.get('origin'),process.env)) return nativeReply(request,{error:'Origin not allowed.'},403)
  const response=nativeReply(request,{ok:true})
  response.headers.set('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Arize-Continuity')
  response.headers.set('Access-Control-Max-Age','600')
  return response
}
async function handler(request: Request, context: Context) {
  try {
    const path=(await context.params).path.join('/'),method=request.method
    if (!['session','account','legal','ai-consent','goals','village','coach'].includes(path)) throw new NativeError('not_found','Not found.',404)
    const url=new URL(request.url),allowedQuery:Record<string,string[]>={goals:['week'],village:['room','before'],coach:['conversation','before']}
    if ([...url.searchParams.keys()].some(key=>!(allowedQuery[path]??[]).includes(key) || url.searchParams.getAll(key).length!==1)) throw new NativeError('input','Invalid query.')
    const s=await nativeSession(request,!['session','account','legal'].includes(path))
    if (path!=='session' && s.context.needsMfa) throw new NativeError('mfa','Complete account verification first.',403)
    if (path==='session' && method==='GET') {
      return nativeReply(request,{user:{id:s.user.id,email:s.user.email ?? ''},profile:s.context.profile,consented:s.context.consented,aiConsented:s.context.aiConsented,deleting:s.context.deleting,needsMfa:s.context.needsMfa,access:s.access,continuity:signContinuity(s.user.id,s.access,process.env.BILLING_ACCESS_SIGNING_SECRET ?? '')})
    }
    let body:Record<string,unknown>={}
    if(method!=='GET'){try{body=await nativeBody(request)}catch{throw new NativeError('input','Send a valid JSON object within the request size limit.')}}
    if (path==='legal' && method==='POST') {
      if (s.context.deleting) throw new NativeError('deleting','Account deletion is pending.',409)
      if (Object.keys(body).length!==1 || body.accepted!==true) throw new NativeError('input','Confirm your agreement first.')
      checked(await s.supabase.rpc('record_legal_consent'));return nativeReply(request,{saved:true})
    }
    if (path==='ai-consent' && method==='POST') {
      if (Object.keys(body).length!==2 || body.accepted!==true || body.version!==NATIVE_AI_DISCLOSURE) throw new NativeError('input','Review the AI sharing disclosure first.')
      checked(await s.supabase.rpc('native_accept_ai_disclosure'));return nativeReply(request,{saved:true})
    }
    if (path==='account' && method==='PATCH') {
      if (s.context.deleting || !s.context.consented) throw new NativeError('setup','Finish legal acceptance or pending deletion first.',403)
      if (Object.keys(body).some(k=>!['name','username'].includes(k)) || typeof body.name!=='string' || !body.name.trim() || body.name.length>100 || typeof body.username!=='string' || getUsernameError(body.username)) throw new NativeError('input','Enter your name and a valid optional username.')
      const profile=checked(await s.supabase.from('profiles').update({name:body.name.trim(),username:normalizeUsername(body.username)||null,onboarded:true}).eq('id',s.user.id).select('name,username,onboarded').single())
      return nativeReply(request,{profile})
    }
    if (path==='account' && method==='DELETE') {
      if (!recentSignIn(s.context.startedAt)) throw new NativeError('reauthenticate','Sign out and sign in again, then return here within 15 minutes.',403)
      if (!validDeletionBody(body) || Object.keys(body).some(k=>!['confirmation','acknowledged'].includes(k))) throw new NativeError('input','Type DELETE MY ACCOUNT and confirm the deletion notice.')
      const admin=nativeAdmin()
      const revoked=await admin.auth.admin.signOut(bearer(request)!,'global')
      if (revoked.error) throw new NativeError('storage','Sessions could not be revoked. Deletion has not been completed.',503)
      await deletionWorkflow({userId:s.user.id,token:randomUUID(),store:billingStore(admin),stripeForCustomer:async()=>{const stripe=getStripe();await assertExpectedStripeAccount(stripe);return stripe}})
      return nativeReply(request,{deleted:true})
    }
    if (path==='goals') return nativeReply(request,await nativeGoals(s,method,url,body))
    if (path==='village') return nativeReply(request,await nativeVillage(s,method,url,body))
    if (path==='coach') return nativeReply(request,await nativeCoach(s,method,url,body))
    throw new NativeError('method','Method not allowed.',405)
  } catch (error) {
    // Do not log bearer tokens, identifiers, prompts, private rows or SDK errors.
    if (error instanceof NativeError) return nativeReply(request,{error:error.message,code:error.code},error.status)
    return nativeReply(request,{error:'This service is temporarily unavailable. No successful change is confirmed.',code:'unavailable'},503)
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE }
