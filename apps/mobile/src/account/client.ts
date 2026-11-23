import { createClient } from '@supabase/supabase-js'
import { Browser } from '@capacitor/browser'
import type { MobileConfig } from './config.ts'
import { authCallback } from './config.ts'
import { AUTH_STORAGE_KEY, CONTINUITY_KEY, FLOW_KEY, accountStorage, clearAccountStorage, type Vault } from './storage.ts'
import type { NativeSession } from '../../../../lib/native/contracts'

export class AccountError extends Error { code:string;status:number;constructor(message:string,code='unavailable',status=503) {super(message);this.code=code;this.status=status} }
export function createAccounts(config: MobileConfig, storage: Vault = accountStorage()) {
  const allowedFetch: typeof fetch=(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url
    if (new URL(url).origin!==config.supabaseUrl) return Promise.reject(new Error('Unexpected account destination.'))
    return fetch(input,{...init,credentials:'omit',redirect:'error',signal:init?.signal ?? AbortSignal.timeout(15_000)})
  }
  const client=createClient(config.supabaseUrl,config.publicKey,{auth:{storage,storageKey:AUTH_STORAGE_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'},global:{fetch:allowedFetch}})
  let generation=0
  const requests=new Set<AbortController>()
  const clearPrivate=()=>{generation++;for (const controller of requests) controller.abort();requests.clear()}
  async function request<T>(path:string,method='GET',body?:unknown):Promise<T> {
    if (!/^\/(session|account|legal|ai-consent|goals|village|coach)(?:\?|$)/.test(path)) throw new Error('Unexpected API path.')
    const epoch=generation,controller=new AbortController();requests.add(controller)
    const timeout=setTimeout(()=>controller.abort(),path.startsWith('/coach') && method==='POST'?65_000:20_000)
    try {
      const {data:{session},error}=await client.auth.getSession()
      if (error || !session) throw new AccountError('Please sign in again.','sign_in',401)
      const continuity=await storage.getItem(CONTINUITY_KEY)
      const response=await fetch(`${config.apiOrigin}/api/native/v1${path}`,{method,credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:`Bearer ${session.access_token}`,...(continuity?{'X-Arize-Continuity':continuity}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal})
      if (epoch!==generation) throw new AccountError('Account changed. Please try again.','sign_in',401)
      const data=await response.json()
      if (!response.ok) throw new AccountError(data.error || 'This action could not finish.',data.code,response.status)
      return data as T
    } finally { clearTimeout(timeout);requests.delete(controller) }
  }
  async function session() {
    const data=await request<NativeSession>('/session')
    if (data.continuity) await storage.setItem(CONTINUITY_KEY,data.continuity)
    else if (!data.access.continuity) await storage.removeItem(CONTINUITY_KEY)
    return data
  }
  async function signOut() {
    clearPrivate()
    client.auth.stopAutoRefresh()
    try { const result=await client.auth.signOut({scope:'local'});if (result.error) throw result.error }
    finally { await clearAccountStorage(storage) }
  }
  async function beginFlow(purpose:'recovery'|'signup'|'oauth') {
    const current=await storage.getItem(FLOW_KEY)
    if (current) {try {if (Date.now()-JSON.parse(current).at<10*60_000) throw new AccountError('An account link is already in progress. Finish it or cancel before starting another.','flow',409)} catch (error) {if (error instanceof AccountError) throw error}}
    await storage.setItem(FLOW_KEY,JSON.stringify({purpose,at:Date.now()}))
  }
  async function cancelFlow() {await storage.removeItem(FLOW_KEY);await storage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`)}
  async function handleLink(value:string) {
    const code=authCallback(value,config.callback),pending=await storage.getItem(FLOW_KEY)
    if (!pending) throw new Error('Start this account request from this device first.')
    const flow=JSON.parse(pending)
    if (!['recovery','signup','oauth'].includes(flow.purpose) || !Number.isFinite(flow.at) || flow.at>Date.now() || Date.now()-flow.at>10*60_000) {await cancelFlow();throw new Error('This account link expired. Start again from this device.')}
    try { const {error}=await client.auth.exchangeCodeForSession(code);if (error) throw new Error('The account link is expired or already used.');return flow.purpose as 'recovery'|'signup'|'oauth' }
    finally {await cancelFlow();await Browser.close().catch(()=>undefined)}
  }
  async function google() {
    if (!config.google) throw new Error('Native Google sign-in is not configured yet.')
    await beginFlow('oauth')
    try {
      const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:config.callback,skipBrowserRedirect:true}})
      if (error || !data.url || new URL(data.url).origin!==config.supabaseUrl) throw new Error('Google sign-in could not start.')
      await Browser.open({url:data.url})
    } catch (error) {await cancelFlow();throw error}
  }
  return {client,storage,request,session,signOut,clearPrivate,beginFlow,cancelFlow,handleLink,google,config}
}
export type Accounts=ReturnType<typeof createAccounts>
