// Actual isolated Auth/PostgREST/SQL; simulated transport only, never provider delivery.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID,createECDH,randomBytes,createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {dispatchPush} from '../../lib/notifications/delivery.ts'
import {localServices,localSql} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Fictional local test flag required')
const state=localServices(),app='http://127.0.0.1:3190',run=randomUUID().slice(0,8),clients=[]
assert.equal(localSql('select edition from public.clarity_installation'),'adult')
assert.equal(localSql('select enabled from public.browser_push_control where id'),'f')
const original=globalThis.fetch
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(![state.API_URL,app].includes(url.origin))throw new Error('Hosted/provider network forbidden');return original(input,init)}
const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
async function ok(value){const result=await value;if(result.error)throw new Error('Local push operation rejected');return result.data}
const store={async call(name,args){return ok(admin.rpc(name,args))}}
const curve=createECDH('prime256v1');curve.generateKeys()
const sub=(suffix)=>({endpoint:'https://fcm.googleapis.com/fcm/send/fictional-'+suffix,expirationTime:null,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}})
const env={ARIZE_EDITION:'adult',BROWSER_PUSH_ENABLED:'true',NEXT_PUBLIC_BROWSER_PUSH_ENABLED:'true',BROWSER_PUSH_SEND_ENABLED:'true',NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY:curve.getPublicKey().toString('base64url'),BROWSER_PUSH_VAPID_PRIVATE_KEY:curve.getPrivateKey().toString('base64url'),BROWSER_PUSH_CONTACT:'mailto:fictional@example.test'}
const operator='fictional-local-push-operator-secret-only-123456'
async function account(prefix){const email=`push-${prefix}-${run}@example.test`,password='Local-fixture-only-123456!';const {user}=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));const c=createClient(state.API_URL,state.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);const session=(await ok(c.auth.signInWithPassword({email,password}))).session;await ok(c.rpc('record_legal_consent'));await ok(c.from('profiles').update({name:'Fictional push '+prefix,onboarded:true}).eq('id',user.id));return {c,id:user.id,cookie:'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')}}
const api=(cookie,body)=>fetch(app+'/api/notifications/browser',{method:'POST',headers:{origin:app,'content-type':'application/json',cookie},body:JSON.stringify(body)})
let stage='SQL regressions'
try{
 const sql=readFileSync(new URL('../browser-push-database.sql',import.meta.url),'utf8').split('\n').filter(line=>!line.startsWith('\\')).join('\n')
 localSql(sql)
 console.log('PASS local SQL ownership, budgets, leases, retries, revocation, deletion, DST and Student refusal (rolled back)')
 stage='real Auth HTTP'
 const a=await account('eligible'),b=await account('other')
 await ok(a.c.from('goals').insert({user_id:a.id,title:'Fictional reminder eligibility',is_complete:true}))
 const subscription=sub(run),hash=createHash('sha256').update(subscription.endpoint).digest('hex')
 assert.equal((await api('',{action:'state'})).status,401)
 const response=await api(a.cookie,{action:'state'});assert.equal(response.status,200);const current=await response.json();assert.equal(current.eligible,true);assert.match(current.accountGuard,/^[a-f0-9]{64}$/)
 const other=await(await api(b.cookie,{action:'state'})).json()
 assert.notEqual(current.accountGuard,other.accountGuard)
 const request={action:'register',subscription,time:'09:30',timezone:'America/New_York',accountGuard:current.accountGuard}
 assert.equal((await api(b.cookie,request)).status,409)
 assert.equal((await api(a.cookie,{...request,accountGuard:undefined})).status,409)
 assert.equal((await api(a.cookie,request)).status,200)
 assert.equal((await api(a.cookie,{action:'disable',endpointHash:hash,accountGuard:current.accountGuard})).status,200)
 const health=await fetch(app+'/api/notifications/dispatch',{headers:{authorization:'Bearer '+operator}});assert.equal(health.status,200);assert.equal((await health.json()).enabled,false)
 assert.equal((await fetch(app+'/api/notifications/dispatch')).status,401)
 assert.deepEqual(await(await fetch(app+'/api/notifications/dispatch',{method:'POST',headers:{authorization:'Bearer '+operator}})).json(),{state:'disabled'})
 console.log('PASS actual Auth cookie/origin/API, account-bound mutations, opt-out, protected health and real sending remains disabled')
 stage='load seed'
 // Refuse any pre-existing non-fictional endpoint before manipulating this disposable queue.
 const existing=await ok(admin.from('browser_push_subscriptions').select('subscription'))
 assert.ok(existing.every(row=>String(row.subscription.endpoint).includes('/fictional-')))
 const template=JSON.stringify(sub('load')).replaceAll("'","''")
 localSql(`begin;
 create temporary table push_load_ids on commit drop as select gen_random_uuid() id,g from generate_series(1,1000) g;
 insert into auth.users(id,email,email_confirmed_at) select id,'push-load-${run}-'||g||'@example.test',now() from push_load_ids;
 update public.profiles set onboarded=true where id in(select id from push_load_ids);
 insert into public.legal_consents(user_id,terms_version,privacy_version) select id,'2.0','2.0' from push_load_ids;
 insert into public.goals(user_id,title,is_complete) select id,'Fictional load eligibility',true from push_load_ids;
 insert into public.browser_push_preferences(user_id,enabled,reminder_time,timezone) select id,true,date_trunc('minute',now() at time zone 'UTC')::time,'UTC' from push_load_ids;
 insert into public.browser_push_subscriptions(user_id,endpoint_hash,subscription) select id,md5(id::text)||md5(id::text),jsonb_set('${template}'::jsonb,'{endpoint}',to_jsonb('https://fcm.googleapis.com/fcm/send/fictional-${run}-'||id::text)) from push_load_ids;
 update public.browser_push_control set enabled=true where id;commit;`)
 const seen=new Set(),started=performance.now();let iterations=0,delivered=0
 const transport=async(value,payload)=>{assert.ok(value.endpoint.includes('/fictional-'));assert.doesNotMatch(payload,/userId|score|conversation|name|token/i);assert.equal(seen.has(value.endpoint),false);seen.add(value.endpoint)}
 stage='1000-device local queue'
 while(iterations++<12&&delivered<1000){
  const results=await Promise.all([dispatchPush(store,env,transport),dispatchPush(store,env,transport)])
  for(const result of results){assert.equal(result.unconfirmed,0);await ok(admin.rpc('browser_push_record_run',{p_summary:result}));delivered+=result.sent}
 }
 assert.equal(seen.size,1000);assert.equal(delivered,1000)
 assert.equal((await dispatchPush(store,env,transport)).sent,0)
 const summary=await ok(admin.rpc('browser_push_health'))
 assert.equal(summary.pending,0);assert.equal(summary.leased,0)
 assert.doesNotMatch(JSON.stringify(summary),/endpoint|p256dh|user_id|subscription/)
 console.log(JSON.stringify({check:'PASS 1000 local fictional devices, concurrent workers, no duplicate simulated sends',processed:delivered,elapsedMs:Math.round(performance.now()-started),pending:summary.pending,leased:summary.leased}))
 stage='pause and eligibility'
 await ok(admin.rpc('browser_push_pause'));assert.equal((await ok(admin.rpc('browser_push_health'))).enabled,false)
 assert.equal((await ok(admin.rpc('browser_push_claim',{p_limit:20}))).length,0)
 const jwt=(await a.c.auth.getSession()).data.session.access_token
 await ok(admin.auth.admin.signOut(jwt,'global'));assert.equal((await api(a.cookie,{action:'state'})).status,401)
 await ok(admin.auth.admin.updateUserById(a.id,{ban_duration:'24h'}));assert.equal(await ok(admin.rpc('browser_push_eligible',{p_user:a.id})),false)
 assert.ok((await a.c.rpc('browser_push_health')).error)
 assert.equal(localSql("select count(*) from pg_class where relname in('browser_push_control','browser_push_runs') and relrowsecurity"),'2')
 console.log('PASS pause switch, banned-account eligibility, client monitoring denial and new-table RLS')
}catch{console.error('Local push acceptance failed at stage: '+stage);process.exitCode=1}
finally{localSql('update public.browser_push_control set enabled=false where id');localSql(`update public.browser_push_preferences set enabled=false where user_id in(select id from auth.users where email like 'push-load-${run}-%@example.test')`);for(const c of clients)c.auth.stopAutoRefresh();admin.auth.stopAutoRefresh();globalThis.fetch=original}
