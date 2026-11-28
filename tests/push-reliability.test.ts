import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createECDH,randomBytes} from 'node:crypto'
import {EventEmitter} from 'node:events'
import type {request as RequestType} from 'node:https'
import {dispatchPush,pushCapacity} from '../lib/notifications/delivery.ts'
import {boundedPushTransport} from '../lib/notifications/transport.ts'
import {pushHealth} from '../lib/notifications/policy.ts'
import {reminderAccountGuard,matchesReminderAccount} from '../lib/notifications/account-guard.ts'
const curve=createECDH('prime256v1');curve.generateKeys()
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fictional-load',expirationTime:null,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}
const env={ARIZE_EDITION:'adult',BROWSER_PUSH_ENABLED:'true',NEXT_PUBLIC_BROWSER_PUSH_ENABLED:'true',BROWSER_PUSH_SEND_ENABLED:'true',NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY:curve.getPublicKey().toString('base64url'),BROWSER_PUSH_VAPID_PRIVATE_KEY:curve.getPrivateKey().toString('base64url'),BROWSER_PUSH_CONTACT:'mailto:push@example.test'}
const claim=()=>({id:randomUUID(),token:randomUUID(),subscription})
test('bounded draining processes more than one batch, honors concurrency and caps per-run work',async()=>{
 const pending=Array.from({length:1000},claim);let active=0,peak=0,sent=0
 const store={async call(name:string,args?:Record<string,unknown>){if(name==='browser_push_claim')return pending.splice(0,Number(args?.p_limit));return true}}
 const transport=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));sent++;active--}
 const first=await dispatchPush(store,env,transport)
 assert.equal(first.claimed,100);assert.equal(first.sent,100);assert.equal(first.stop,'limit');assert.ok(peak<=8)
 for(let i=0;i<9;i++)await dispatchPush(store,env,transport)
 assert.equal(sent,1000);assert.equal(pending.length,0)
 assert.equal(pushCapacity({...env,BROWSER_PUSH_MAX_JOBS_PER_RUN:'501'}),null)
 assert.equal(pushCapacity({...env,BROWSER_PUSH_CONCURRENCY:'9'}),null)
})
test('budget exhaustion never claims work; lost finalization is partial, never confirmed delivery',async()=>{
 let clock=0,calls=0
 const noClaim={async call(){calls++;return []}}
 const result=await dispatchPush(noClaim,env,async()=>{},()=>{const n=clock;clock+=75000;return n})
 assert.equal(result.stop,'budget');assert.equal(calls,0)
 const work=claim()
 const result2=await dispatchPush({async call(name){return name==='browser_push_claim'?[work]:name==='browser_push_finish'?false:true}},env,async()=>{})
 assert.equal(result2.state,'partial');assert.equal(result2.unconfirmed,1);assert.equal(result2.sent,0)
})
test('provider auth failures pause dispatch before claiming another batch',async()=>{
 const calls:string[]=[]
 const result=await dispatchPush({async call(name){calls.push(name);return name==='browser_push_claim'?[claim()]:true}},env,async()=>{throw {statusCode:403,body:'private payload'}})
 assert.equal(result.stop,'provider_auth');assert.ok(calls.includes('browser_push_pause'))
 assert.equal(calls.filter(x=>x==='browser_push_claim').length,1);assert.doesNotMatch(JSON.stringify(result),/payload|endpoint/)
})
test('hard-bounded transport encrypts offline and exposes no provider body or URL on errors',async()=>{
 let endpoint='',body:unknown,aborted=false
 const request=((url:unknown,options:{signal:AbortSignal},callback:(res:unknown)=>void)=>{
  endpoint=String(url);options.signal.addEventListener('abort',()=>{aborted=true})
  const req=new EventEmitter() as EventEmitter&{end:(data:unknown)=>void}
  req.end=data=>{body=data;queueMicrotask(()=>callback({statusCode:410,resume(){},destroy(){}}))};return req
 }) as unknown as typeof RequestType
 await assert.rejects(boundedPushTransport(request)(subscription,'generic reminder',{vapidDetails:{publicKey:env.NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY,privateKey:env.BROWSER_PUSH_VAPID_PRIVATE_KEY,subject:env.BROWSER_PUSH_CONTACT},TTL:900,timeout:5000,urgency:'low',topic:'arize'}),error=>typeof error==='object'&&error!==null&&'statusCode'in error&&error.statusCode===410)
 assert.equal(endpoint,subscription.endpoint);assert.ok(Buffer.isBuffer(body));assert.doesNotMatch(String(body),/generic reminder/);assert.equal(aborted,false)
})
test('hard deadline aborts a stalled HTTPS request without opening any network connection',async()=>{
 let aborted=false
 const request=((_url:unknown,options:{signal:AbortSignal})=>{options.signal.addEventListener('abort',()=>{aborted=true});const req=new EventEmitter() as EventEmitter&{end:()=>void};req.end=()=>{};return req}) as unknown as typeof RequestType
 const start=Date.now()
 await assert.rejects(boundedPushTransport(request)(subscription,'generic',{vapidDetails:{publicKey:env.NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY,privateKey:env.BROWSER_PUSH_VAPID_PRIVATE_KEY,subject:env.BROWSER_PUSH_CONTACT},TTL:900,timeout:5000,urgency:'low',topic:'arize'}))
 assert.equal(aborted,true);assert.ok(Date.now()-start<6500)
})
test('health DTO strips extra fields, and action binding rejects another account without exposing its ID',()=>{
 const a=reminderAccountGuard('fictional-a','local-notification-action-secret-only-12345'),b=reminderAccountGuard('fictional-b','local-notification-action-secret-only-12345')
 assert.ok(matchesReminderAccount(a,a));assert.equal(matchesReminderAccount(a,b),false);assert.equal(matchesReminderAccount([],a),false)
 const health=pushHealth({enabled:false,pending:0,leased:0,oldestDueSeconds:0,failedDue24h:0,expiredDue24h:0,lastRunAt:null,lastRun:null,subscription,userId:'private'})
 assert.ok(health);assert.doesNotMatch(JSON.stringify(health),/subscription|endpoint|userId|private/)
 assert.equal(pushHealth({...health,pending:-1}),null)
})
