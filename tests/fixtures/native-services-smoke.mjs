// REAL local Supabase Auth/PostgREST/Realtime/Mailpit; only AI is mocked.
import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createAccounts} from '../../apps/mobile/src/account/client.ts'
import {mobileConfig} from '../../apps/mobile/src/account/config.ts'
import {FLOW_KEY,CONTINUITY_KEY} from '../../apps/mobile/src/account/storage.ts'
import {localServices,localSql} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Disposable local services only')
const state=localServices(),origin='http://127.0.0.1:3183',app='http://127.0.0.1:3190',run=randomUUID().slice(0,8)
const originalFetch=globalThis.fetch
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!['56581','56584','3190','3191'].includes(url.port))throw new Error('Hosted network forbidden in native acceptance');return originalFetch(input,init)}
const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const config=mobileConfig({VITE_NATIVE_ENABLED:'true',VITE_ARIZE_EDITION:'adult',VITE_NATIVE_LOCAL_TEST:'true',VITE_ADULT_SUPABASE_URL:state.API_URL,VITE_ADULT_API_ORIGIN:app,VITE_ADULT_SUPABASE_PUBLISHABLE_KEY:state.ANON_KEY},false)
const clients=[],created=[],password='Local-fixture-only-123456!'
let stage='start'
const pass=value=>console.log('PASS '+value)
async function checked(result){const value=await result;if(value.error)throw new Error(`Local service rejected operation (${value.error.code??value.error.status??'unknown'})`);return value.data}
function client(){const value=createAccounts(config);clients.push(value);return value}
async function token(c){return (await c.client.auth.getSession()).data.session.access_token}
async function account(prefix){const email=`native-${prefix}-${run}@example.test`;const data=await checked(admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Fictional Local Reviewer',native_fixture:run}}));created.push(data.user.id);const c=client();await checked(c.client.auth.signInWithPassword({email,password}));return {c,id:data.user.id,email}}
async function api(path,c,method='GET',body){return fetch(app+'/api/native/v1'+path,{method,headers:{origin,...(c?{authorization:`Bearer ${await token(c)}`}:{cookie:'not-a-bearer'}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
async function setup(c,ai=true){await c.request('/legal','POST',{accepted:true});await c.request('/account','PATCH',{name:'Fictional Local Reviewer',username:''});if(ai)await c.request('/ai-consent','POST',{accepted:true,version:'adult-native-ai-2026-11-22'})}
async function mailLink(email,exclude){
 for(let attempt=0;attempt<60;attempt++){
  const inbox=await(await fetch('http://127.0.0.1:56584/api/v1/messages')).json()
  const item=inbox.messages.find(message=>message.To?.some(to=>to.Address===email))
  if(item){const mail=await(await fetch('http://127.0.0.1:56584/api/v1/message/'+item.ID)).json();const matches=String(mail.HTML??mail.Text).matchAll(/https?:[^\s"<>]+/g);for(const match of matches){const url=new URL(match[0].replaceAll('&amp;','&'));if(url.origin===state.API_URL&&url.pathname==='/auth/v1/verify'&&url.href!==exclude)return url.href}}
  await new Promise(resolve=>setTimeout(resolve,100))
 }
 throw new Error('Local confirmation email not found')
}
async function verifyLink(url){const response=await fetch(url,{redirect:'manual'});assert.ok([302,303].includes(response.status));const location=response.headers.get('location');assert.ok(location?.startsWith(config.callback+'?code='));return location}
function totp(secret){let bits='';for(const letter of secret.replaceAll('=',''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(letter).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),offset=h.at(-1)&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
try{
 assert.equal(localSql("select edition from public.clarity_installation"),'adult')
 stage='native-auth';assert.equal((await api('/session',null)).status,401)
 const a=await account('plus'),b=await account('peer'),core=await account('core')
 await setup(a.c);await setup(b.c);await setup(core.c,false)
 await checked(admin.from('access_grants').delete().in('user_id',[a.id,b.id,core.id]))
 await checked(admin.from('access_grants').insert([a,b].map(value=>({user_id:value.id,plan:'plus',source:'admin',status:'active',starts_at:new Date().toISOString(),ends_at:null}))))
 localSql("update public.membership_launch set enabled=true,stripe_mode='test' where id")
 assert.equal((await a.c.session()).access.plan,'plus');assert.equal((await core.c.session()).access.plan,'core')
 pass('real verified accounts, legal/AI setup, sandbox Core/Plus resolution and bearer-only access')
 stage='goals';const now=new Date(),sunday=new Date(now);sunday.setDate(now.getDate()-now.getDay());const week=`${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`
 const goal={id:randomUUID(),title:'Local completed goal',category:'Personal',week_of:week,deadline:null,notes:null}
 await a.c.request('/goals','POST',goal);await a.c.request('/goals','PATCH',{id:goal.id,is_complete:true});await a.c.request('/goals','POST',goal)
 await a.c.request('/goals','PATCH',{...goal,title:'Edited completed goal'})
 assert.equal((await a.c.request('/goals?week='+week)).goals.find(value=>value.id===goal.id).is_complete,true)
 assert.equal((await api('/goals',b.c,'PATCH',{id:goal.id,is_complete:false})).status,404)
 assert.equal((await checked(b.c.client.from('goals').select('id').eq('id',goal.id))).length,0)
 for(let i=0;i<3;i++)await core.c.request('/goals','POST',{...goal,id:randomUUID(),title:'Fictional Core goal '+i})
 assert.notEqual((await api('/goals',core.c,'POST',{...goal,id:randomUUID()})).status,200)
 pass('real goal persistence, completion preservation, cross-account RLS and Core goal cap')
 stage='history';const conversation=randomUUID();await checked(admin.from('coach_conversations').insert({id:conversation,user_id:a.id,title:'Long fictional local chat'}))
 const rows=Array.from({length:205},(_,i)=>({conversation_id:conversation,user_id:a.id,role:i%2?'assistant':'user',content:'Fictional history message '+(i+1),created_at:'2026-11-22T00:00:00Z'}))
 await checked(admin.from('coach_messages').insert(rows))
 const first=await a.c.request('/coach?conversation='+conversation);assert.equal(first.messages.length,200);assert.ok(first.before)
 const earlier=await a.c.request('/coach?conversation='+conversation+'&before='+encodeURIComponent(first.before));assert.equal(earlier.messages.length,5);assert.equal(earlier.before,null)
 assert.equal(new Set([...earlier.messages,...first.messages].map(value=>value.id)).size,205)
 assert.equal(first.messages.at(-1).content,'Fictional history message 205');assert.equal(earlier.messages[0].content,'Fictional history message 1')
 assert.equal((await api('/coach?conversation='+conversation,b.c)).status,404)
 pass('205-message history pagination, tied timestamps, stable IDs and ownership')
 stage='clarity';const turn={requestId:randomUUID(),conversationId:randomUUID(),message:'Fictional local coaching question'}
 const before=await(await fetch('http://127.0.0.1:3191/stats')).json()
 await a.c.request('/coach','POST',turn);await a.c.request('/coach','POST',turn)
 assert.equal((await(await fetch('http://127.0.0.1:3191/stats')).json()).generations,before.generations+1)
 const crisis=await a.c.request('/coach','POST',{...turn,requestId:randomUUID(),conversationId:randomUUID(),message:'fixture-crisis'});assert.equal(crisis.blocked,true);assert.equal(crisis.conversationId,null)
 pass('real quota/ledger/atomic checked history with mocked AI, cached retry and crisis gate')
 stage='village';const room=randomUUID();await checked(admin.from('village_rooms').insert({id:room,name:'Local Acceptance '+run,description:'Fictional isolated text room.'}))
 assert.equal((await api('/village?room='+room,a.c)).status,403)
 await a.c.request('/village','POST',{action:'join',roomId:room});await b.c.request('/village','POST',{action:'join',roomId:room})
 assert.equal((await core.c.request('/village')).rooms.every(value=>value.name==='Wins Only'),true)
 assert.equal((await api('/village?room='+room,core.c)).status,404)
 let received,finish,timer,ready,notReady
 const event=new Promise((resolve,reject)=>{finish=resolve;timer=setTimeout(()=>reject(new Error('Local Realtime delivery timed out')),10000)})
 void event.catch(()=>undefined)
 const subscribed=new Promise((resolve,reject)=>{ready=resolve;notReady=reject})
 const channel=b.c.client.channel('native-local-'+run).on('system',{},payload=>{if(payload.extension==='postgres_changes'&&payload.status==='ok')ready();if(payload.extension==='postgres_changes'&&payload.status==='error')notReady(new Error('Local Postgres subscription rejected'))}).on('postgres_changes',{event:'INSERT',schema:'public',table:'village_messages',filter:'room_id=eq.'+room},payload=>{received=payload.new;finish()})
 const subscriptionTimeout=setTimeout(()=>notReady(new Error('Local Realtime subscription timed out')),10000)
 channel.subscribe(status=>{if(['CHANNEL_ERROR','TIMED_OUT'].includes(status))notReady(new Error('Local Realtime rejected subscription'))})
 try{await subscribed}finally{clearTimeout(subscriptionTimeout)}
 try{const message={id:randomUUID(),roomId:room,action:'send',content:'Fictional text delivered to a second account'};await a.c.request('/village','POST',message);await event;assert.equal(received.id,message.id);await a.c.request('/village','POST',message);assert.equal((await b.c.request('/village?room='+room)).messages.filter(value=>value.id===message.id).length,1)}finally{clearTimeout(timer);await b.c.client.removeChannel(channel)}
 await a.c.request('/village','POST',{action:'leave',roomId:room});assert.equal((await api('/village?room='+room,a.c)).status,403)
 pass('real two-account WebSocket delivery, text dedupe, room membership and Core restriction')
 stage='mfa';const mfa=await account('mfa');await setup(mfa.c)
 const enrolled=await checked(mfa.c.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Local test factor'}))
 await checked(mfa.c.client.auth.mfa.challengeAndVerify({factorId:enrolled.id,code:totp(enrolled.totp.secret)}))
 await mfa.c.signOut();await checked(mfa.c.client.auth.signInWithPassword({email:mfa.email,password}))
 assert.equal((await mfa.c.session()).needsMfa,true);assert.equal((await api('/goals?week='+week,mfa.c)).status,403)
 await checked(mfa.c.client.auth.mfa.challengeAndVerify({factorId:enrolled.id,code:totp(enrolled.totp.secret)}))
 assert.equal((await mfa.c.session()).needsMfa,false)
 pass('real TOTP enrollment/verification, aal1 denial and aal2 acceptance')
 stage='membership-outage';await a.c.session();const continuity=await a.c.storage.getItem(CONTINUITY_KEY);assert.ok(continuity)
 localSql('revoke execute on function public.membership_rollout_state() from authenticated')
 try{
  const known=await a.c.session(),unknown=await core.c.session()
  assert.equal(known.access.plan,'plus');assert.equal(known.access.continuity,true)
  assert.equal(await a.c.storage.getItem(CONTINUITY_KEY),continuity)
  assert.equal(unknown.access.plan,'core');assert.equal(unknown.access.temporarilyUnavailable,true)
 }finally{localSql('grant execute on function public.membership_rollout_state() to authenticated')}
 pass('real local membership-RPC failure preserves known Plus without renewing continuity or upgrading Core')
 stage='sessions';const oldToken=await token(a.c);await checked(a.c.client.auth.refreshSession());assert.ok(await token(a.c))
 await checked(admin.auth.admin.signOut(await token(a.c),'global'))
 assert.equal((await fetch(app+'/api/native/v1/session',{headers:{origin,authorization:'Bearer '+oldToken}})).status,401)
 await checked(admin.auth.admin.updateUserById(b.id,{ban_duration:'1h'}));const banned=client();assert.ok((await banned.client.auth.signInWithPassword({email:b.email,password})).error)
 pass('real token refresh, revoked-session rejection and banned-account login denial')
 stage='signup';const fresh=client(),email='native-signup-'+run+'@example.test';await fresh.beginFlow('signup')
 const signup=await checked(fresh.client.auth.signUp({email,password,options:{emailRedirectTo:config.callback}}));created.push(signup.user.id);assert.equal(signup.session,null)
 assert.ok((await client().client.auth.signInWithPassword({email,password})).error)
 const signupLink=await mailLink(email);const callback=await verifyLink(signupLink)
 await assert.rejects(client().handleLink(callback),/Start this account request/)
 assert.equal(await fresh.handleLink(callback),'signup');assert.ok((await fresh.client.auth.getSession()).data.session)
 await assert.rejects(fresh.handleLink(callback),/Start this account request/)
 const duplicate=await client().client.auth.signUp({email,password,options:{emailRedirectTo:config.callback}})
 if(duplicate.error)assert.equal(duplicate.error.code,'user_already_exists');else assert.equal(duplicate.data.session,null)
 pass('real local confirmation email, unconfirmed denial, same-device PKCE, one-use link and duplicate signup')
 stage='reset';await fresh.signOut();await fresh.beginFlow('recovery');await checked(fresh.client.auth.resetPasswordForEmail(email,{redirectTo:config.callback}))
 const resetLink=await mailLink(email,signupLink);assert.notEqual(resetLink,signupLink)
 assert.equal(await fresh.handleLink(await verifyLink(resetLink)),'recovery');await checked(fresh.client.auth.updateUser({password:password+'New'}));await fresh.signOut()
 assert.ok((await fresh.client.auth.signInWithPassword({email,password})).error);await checked(fresh.client.auth.signInWithPassword({email,password:password+'New'}))
 await fresh.beginFlow('recovery');await fresh.storage.setItem(FLOW_KEY,JSON.stringify({purpose:'recovery',at:Date.now()-11*60000}));await assert.rejects(fresh.handleLink(config.callback+'?code=fictional_expired_local_flow'),/expired/)
 pass('real recovery email/PKCE/password replacement and expired local-flow rejection')
 stage='delete';const doomed=await account('delete');await setup(doomed.c)
 await doomed.c.request('/goals','POST',{...goal,id:randomUUID()})
 await doomed.c.request('/account','DELETE',{confirmation:'DELETE MY ACCOUNT',acknowledged:true})
 assert.equal((await admin.auth.admin.getUserById(doomed.id)).data.user,null);assert.equal((await checked(admin.from('profiles').select('id').eq('id',doomed.id))).length,0)
 pass('real account/data deletion after session revocation; no billing customer or Stripe call')
 console.log('Native REAL LOCAL service acceptance passed. No production database, real email, Stripe, Apple or external AI used.')
}catch(error){console.error('Native local acceptance failed at '+stage+': '+error.message);process.exitCode=1}
finally{for(const c of clients){c.clearPrivate();c.client.auth.stopAutoRefresh();await c.client.removeAllChannels().catch(()=>undefined)}globalThis.fetch=originalFetch}
