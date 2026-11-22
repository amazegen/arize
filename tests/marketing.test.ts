import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {captureConfigured,captureLead,leadInput,LEAD_CONSENT_VERSION,marketingOrigin,normalizedEmail,rateKeys,sameMarketingOrigin,type MarketingEnv,type MarketingStore} from '../lib/marketing/policy.ts'
import {notificationConfig,notifyLead} from '../lib/marketing/notifications.ts'
const env:MarketingEnv={ARIZE_EDITION:'adult',MARKETING_LEAD_CAPTURE_ENABLED:'true',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3167',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3166',SUPABASE_SERVICE_ROLE_KEY:'fictional-only',MARKETING_RATE_LIMIT_SECRET:'fictional-rate-secret-not-for-real-use-123',MARKETING_NOTIFICATION_ENABLED:'true',MARKETING_LEAD_FROM_EMAIL:'notify@example.test',MARKETING_LEAD_NOTIFY_EMAIL:'owner@example.test',MARKETING_RESEND_API_KEY:'re_fictional_only'}
const id='e1000000-0000-4000-8000-000000000001',token='e2000000-0000-4000-8000-000000000001'
const claim={id,token,email:'lead@example.test'}
function store(value:unknown=claim) { const calls:{name:string;args?:Record<string,unknown>}[]=[];return {calls,async call(name:string,args?:Record<string,unknown>) {calls.push({name,args});return name==='marketing_finish_notification'?true:value}} }
test('marketing email and body validation rejects injection, extra fields and missing explicit consent',()=>{
 assert.equal(normalizedEmail(' Person+tag@Example.TEST '),'person+tag@example.test')
 for(const email of ['a@b','a..b@example.test','.a@example.test','a.@example.test','a@example.test\r\nBcc:x@y.test','<x>@example.test',`${'a'.repeat(65)}@example.test`,null])assert.equal(normalizedEmail(email),null)
 assert.deepEqual(leadInput({email:'a@example.test',consent:true,website:''}),{email:'a@example.test',consent:true})
 for(const body of [{email:'a@example.test',consent:false,website:''},{email:'a@example.test',consent:true,website:'',to:'attacker@example.test'},[],null])assert.equal(leadInput(body),null)
 assert.equal(leadInput({email:'invalid',consent:false,website:'bot.example'}),'honeypot')
})
test('capture is opt-in, adult-only and bound to a canonical same origin',()=>{
 assert.equal(captureConfigured(env),true)
 for(const extra of [{ARIZE_EDITION:'student'},{MARKETING_LEAD_CAPTURE_ENABLED:'false'},{MARKETING_RATE_LIMIT_SECRET:'short'},{SUPABASE_SERVICE_ROLE_KEY:''},{NEXT_PUBLIC_APP_URL:'https://site.test/path'}])assert.equal(captureConfigured({...env,...extra}),false)
 assert.equal(marketingOrigin({...env,NEXT_PUBLIC_APP_URL:'https://site.test/?x=1'}),null)
 const req=(origin:string,host='127.0.0.1:3167',site='same-origin')=>new Request('http://localhost/api/marketing/leads',{headers:{origin,host,'sec-fetch-site':site}})
 assert.equal(sameMarketingOrigin(req(env.NEXT_PUBLIC_APP_URL!),env),true)
 assert.equal(sameMarketingOrigin(req('https://evil.test'),env),false)
 assert.equal(sameMarketingOrigin(req(env.NEXT_PUBLIC_APP_URL!,'evil.test'),env),false)
 assert.equal(sameMarketingOrigin(req(env.NEXT_PUBLIC_APP_URL!,'127.0.0.1:3167','cross-site'),env),false)
})
test('rate keys are keyed, daily-rotating pseudonyms and ignore spoofable forwarded headers locally',()=>{
 const req=new Request('http://127.0.0.1',{headers:{'x-forwarded-for':'1.2.3.4','x-vercel-forwarded-for':'1.2.3.4'}})
 const at=new Date('2026-11-22T12:00Z'),a=rateKeys(req,'lead@example.test',env,at)
 assert.match(a.ip,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(a),/1\.2\.3\.4|lead@/)
 assert.deepEqual(a,rateKeys(new Request('http://127.0.0.1'),'lead@example.test',env,at))
 assert.notEqual(a.ip,rateKeys(req,'lead@example.test',{...env,VERCEL:'1'},at).ip)
 assert.notEqual(a.email,rateKeys(req,'lead@example.test',env,new Date('2026-11-23T12:00Z')).email)
})
test('capture sends only minimal consent and pseudonymous quota metadata, never a notification recipient',async()=>{
 const db=store({accepted:true,leadId:id});assert.deepEqual(await captureLead(db,'lead@example.test',{ip:'a'.repeat(64),email:'b'.repeat(64)}),{accepted:true,leadId:id})
 assert.equal(db.calls[0].args?.p_consent_version,LEAD_CONSENT_VERSION)
 assert.deepEqual(Object.keys(db.calls[0].args!).sort(),['p_consent_version','p_email','p_email_key','p_ip_key'])
 assert.deepEqual(await captureLead(store({accepted:true,leadId:null}),'lead@example.test',{ip:'a',email:'b'}),{accepted:true,leadId:null})
 await assert.rejects(captureLead(store({accepted:true,leadId:'not-a-uuid'}),'lead@example.test',{ip:'a',email:'b'}))
})
test('missing notification settings and Student mode cannot claim or send mail',async()=>{
 for(const extra of [{MARKETING_NOTIFICATION_ENABLED:'false'},{MARKETING_LEAD_NOTIFY_EMAIL:''},{MARKETING_RESEND_API_KEY:''},{ARIZE_EDITION:'student'}]) {
  const db=store();assert.equal(notificationConfig({...env,...extra}),null)
  assert.equal(await notifyLead(db,{...env,...extra},id,async()=>{throw new Error('Must not send')}),'not_configured');assert.equal(db.calls.length,0)
 }
})
test('notification uses fixed provider/recipient/plain text and stable idempotency key across retries',async()=>{
 const requests:{url:string;init:RequestInit}[]=[]
 const send:typeof fetch=async(input,init)=>{requests.push({url:String(input),init:init!});return Response.json({id:'fictional-provider-id'})}
 for(let i=0;i<2;i++){const db=store();assert.equal(await notifyLead(db,env,id,send),'sent');assert.equal(db.calls.at(-1)?.args?.p_result,'sent')}
 assert.equal(requests[0].url,'https://api.resend.com/emails');assert.equal(requests[0].init.redirect,'error')
 assert.deepEqual(JSON.parse(String(requests[0].init.body)).to,['owner@example.test'])
 assert.equal(new Headers(requests[0].init.headers).get('Idempotency-Key'),`arize-lead/${id}`)
 assert.equal(requests[0].init.body,requests[1].init.body)
 assert.equal('html' in JSON.parse(String(requests[0].init.body)),false)
})
test('provider outage, permanent rejection and finalization errors retain safe delivery state',async()=>{
 for(const [status,result]of [[503,'retry'],[429,'retry'],[400,'review'],[409,'review']] as const){const db=store();assert.equal(await notifyLead(db,env,id,async()=>new Response(null,{status})),result);assert.equal(db.calls.at(-1)?.args?.p_result,result)}
 const db:MarketingStore={async call(name){if(name==='marketing_finish_notification')throw new Error('private provider detail');return claim}}
 assert.equal(await notifyLead(db,env,id,async()=>Response.json({id:'fictional'})),'unavailable')
 const broken=store({id:'bad',token,email:'lead@example.test'});assert.equal(await notifyLead(broken,env,id,async()=>{throw new Error('Must not send')}),'unavailable')
})
test('public page uses shared prices and tokens, omits unfinished promises and has no Student data coupling',()=>{
 const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
 const page=read('components/marketing/MarketingPage.tsx'),route=read('app/api/marketing/leads/route.ts'),proxy=read('proxy.ts'),form=read('components/marketing/LeadForm.tsx')
 assert.match(page,/MEMBERSHIP_PRICING\.monthlyUsd/);assert.match(page,/CORE_LIMITS\.coachMessagesPerMonth/)
 assert.doesNotMatch(page,/Friday reflection|exports|students\.arizeapp|\$1\.99|\$19\.99/i)
 assert.match(route,/2_048/);assert.match(route,/sameMarketingOrigin/);assert.match(route,/after\(async/);assert.match(route,/ARIZE_EDITION === 'student'/)
 assert.ok(proxy.indexOf("pathname === '/'")<proxy.indexOf('createServerClient('))
 assert.doesNotMatch(form,/process\.env|service_role|MARKETING_RESEND|console\./)
 assert.match(form,/aria-busy/);assert.match(form,/type="checkbox" name="consent" required/)
})
