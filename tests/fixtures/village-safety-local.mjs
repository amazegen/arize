// Actual isolated Auth/REST/Storage acceptance. No hosted data, external AI, Stripe or email.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {localServices,localSql} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Fictional local services required')
const env=localServices(),run=randomUUID().slice(0,8),clients=[]
const originalFetch=globalThis.fetch
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.origin!==env.API_URL)throw new Error('Hosted network forbidden');return originalFetch(input,init)}
assert.equal(localSql('select edition from public.clarity_installation'),'adult')
if(!localSql("select to_regnamespace('village_safety_private')")){
 if(!process.argv.includes('--install-local'))throw new Error('Explicit --install-local required for the prepared local migration')
 localSql(readFileSync(new URL('../../supabase/migrations/20261124174225_adult_village_safety.sql',import.meta.url),'utf8'))
 localSql("notify pgrst, 'reload schema'")
}
const make=(key)=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),admin=make(env.SERVICE_ROLE_KEY)
async function ok(value){const result=await value;if(result.error)throw new Error('Local operation rejected: '+result.error.code+' '+result.error.message);return result.data}
async function denied(value){assert.ok((await value).error,'Expected rejection')}
async function account(label){const email=`village-${label}-${run}@example.test`,password='Local-fixture-only-123456!';const {user}=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));const c=make(env.ANON_KEY);clients.push(c);await ok(c.auth.signInWithPassword({email,password}));await ok(c.rpc('record_legal_consent'));await ok(c.from('profiles').update({name:'Fictional Village '+label,onboarded:true}).eq('id',user.id));await ok(admin.from('access_grants').insert({user_id:user.id,plan:'plus',source:'admin',status:'active',starts_at:new Date().toISOString()}));return {c,id:user.id}}
const safety=(a,action,room,message,extra={})=>a.c.rpc('village_safety',{p_action:action,p_room:room,p_message:message,...extra})
try{
 const a=await account('reporter'),b=await account('author'),mod=await account('moderator'),outsider=await account('outsider')
 const room=randomUUID(),other=randomUUID();await ok(admin.from('village_rooms').insert([{id:room,name:'Safety Local '+run},{id:other,name:'Other Safety Local '+run}]))
 for(const who of [a,b,mod])assert.equal(await ok(who.c.rpc('join_village_room',{target_room_id:room})),false)
 assert.equal((await ok(b.c.from('village_memberships').select('is_moderator').eq('room_id',room)))[0].is_moderator,false)
 await denied(a.c.rpc('assign_village_moderator',{target_room_id:room,target_user_id:a.id}))
 await ok(admin.from('village_memberships').update({is_moderator:true}).eq('room_id',room).eq('user_id',a.id))
 assert.equal((await ok(safety(a,'state',room))).moderator,false)
 await denied(safety(a,'queue',room));await denied(safety(outsider,'state',room))
 localSql(`insert into village_safety_private.moderators(user_id,room_id) values('${mod.id}','${room}')`)
 assert.equal((await ok(safety(mod,'state',room))).moderator,true)
 const message=randomUUID();await ok(b.c.from('village_messages').insert({id:message,room_id:room,user_id:b.id,content:'Fictional first safety message',created_at:'2000-01-01'}))
 const row=(await ok(b.c.from('village_messages').select('created_at').eq('id',message)))[0];assert.ok(Date.parse(row.created_at)>Date.now()-15000)
 await denied(b.c.from('village_messages').insert({room_id:room,user_id:b.id,content:'Too fast'}))
 await denied(a.c.from('village_messages').update({content:'Forged edit'}).eq('id',message))
 await denied(a.c.from('village_messages').delete().eq('id',message))
 await ok(safety(a,'report',room,message,{p_reason:'harassment'}));await ok(safety(a,'report',room,message,{p_reason:'spam'}))
 assert.equal(localSql(`select count(*) from village_safety_private.reports where message_id='${message}'`),'1')
 await denied(safety(a,'moderate',room,message,{p_decision:'hide'}));await denied(safety(mod,'moderate',other,message,{p_decision:'hide'}))
 const queue=await ok(safety(mod,'queue',room));assert.equal(queue.reports.length,1);assert.equal(queue.reports[0].content,'Fictional first safety message');assert.equal('reporter_id'in queue.reports[0],false)
 await ok(safety(a,'block',room,message));assert.equal((await ok(a.c.from('village_messages').select('id').eq('id',message))).length,0)
 const own=randomUUID();await ok(a.c.from('village_messages').insert({id:own,room_id:room,user_id:a.id,content:'Hidden from blocked author'}));assert.equal((await ok(b.c.from('village_messages').select('id').eq('id',own))).length,0)
 assert.equal((await ok(mod.c.from('village_messages').select('id').eq('id',message))).length,1)
 await ok(a.c.rpc('village_safety',{p_action:'unblock',p_target:b.id}));assert.equal((await ok(a.c.from('village_messages').select('id').eq('id',message))).length,1)
 await ok(safety(mod,'moderate',room,message,{p_decision:'hide'}));assert.equal((await ok(b.c.from('village_messages').select('id').eq('id',message))).length,0)
 assert.equal((await ok(safety(mod,'queue',room))).reports[0].status,'hidden')
 await ok(safety(mod,'moderate',room,message,{p_decision:'restore'}));assert.equal((await ok(a.c.from('village_messages').select('id').eq('id',message))).length,1)
 await ok(safety(mod,'moderate',room,message,{p_decision:'mute'}));await denied(b.c.from('village_messages').insert({room_id:room,user_id:b.id,content:'Muted attempt'}))
 await ok(safety(mod,'moderate',room,message,{p_decision:'unmute'}));assert.equal(localSql(`select count(*) from village_safety_private.audit where room_id='${room}'`),'4')
 localSql(`update public.village_messages set created_at=now()-interval '3 seconds' where user_id='${b.id}'`)
 await denied(b.c.from('village_messages').insert({room_id:room,user_id:b.id,content:'  FICTIONAL first safety message  '}))
 console.log('PASS membership persistence, no automatic/legacy escalation, scoped moderator queue, private reports, bilateral blocking, reversible hiding, mutes and audit')
 const quota=Array.from({length:10},(_,i)=>({room_id:room,user_id:b.id,content:'Local rate seed '+i,created_at:new Date(Date.now()-30000).toISOString()}));await ok(admin.from('village_messages').insert(quota))
 await denied(b.c.from('village_messages').insert({room_id:room,user_id:b.id,content:'Minute overflow'}))
 localSql(`update public.village_messages set created_at=now()-interval '2 hours' where user_id='${b.id}'`)
 await ok(admin.from('village_messages').insert(Array.from({length:120},(_,i)=>({room_id:room,user_id:b.id,content:'Local hourly seed '+i,created_at:new Date(Date.now()-120000).toISOString()}))))
 await denied(b.c.from('village_messages').insert({room_id:room,user_id:b.id,content:'Hour overflow'}))
 const reports=Array.from({length:6},(_,i)=>({id:randomUUID(),room_id:room,user_id:b.id,content:'Local report quota '+i}));await ok(admin.from('village_messages').insert(reports))
 for(const msg of reports.slice(0,4))await ok(safety(a,'report',room,msg.id,{p_reason:'spam'}))
 await denied(safety(a,'report',room,reports[4].id,{p_reason:'spam'}))
 console.log('PASS database-enforced timestamp, cooldown, normalized duplicate, per-minute/hour send budgets and report budget')
 const key=`${b.id}/${room}/fictional-${run}.webm`,media=randomUUID();await ok(b.c.storage.from('village-audio').upload(key,new TextEncoder().encode('Fictional media fixture'),{contentType:'audio/webm'}))
 await ok(admin.from('village_messages').insert({id:media,room_id:room,user_id:b.id,content:'Fictional legacy media',message_type:'audio',audio_url:env.API_URL+'/storage/v1/object/public/village-audio/'+key}))
 const signed=await ok(a.c.storage.from('village-audio').createSignedUrl(key,60));assert.equal((await fetch(signed.signedUrl)).status,200)
 assert.notEqual((await fetch(env.API_URL+'/storage/v1/object/public/village-audio/'+key)).status,200)
 await denied(outsider.c.storage.from('village-audio').createSignedUrl(key,60))
 await ok(safety(a,'block',room,media));await denied(a.c.storage.from('village-audio').createSignedUrl(key,60))
 console.log('PASS private media, legacy-path compatibility, authorized signed read, anonymous/outsider/blocked signing denial; existing signed URL TTL is bounded, not instant revocation')
 await ok(outsider.c.rpc('join_village_room',{target_room_id:room}))
 const burst=await Promise.all(Array.from({length:6},(_,i)=>outsider.c.from('village_messages').insert({room_id:room,user_id:outsider.id,content:'Concurrent fictional send '+i})))
 assert.equal(burst.filter(result=>!result.error).length,1)
 const factor=await ok(a.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Local policy fixture'}))
 localSql(`update auth.mfa_factors set status='verified' where id='${factor.id}' and user_id='${a.id}'`)
 await denied(safety(a,'state',room))
 console.log('PASS concurrent send serialization and verified-factor AAL1 safety-action denial')
 console.log('Adult Village local acceptance passed; no hosted database or external service touched.')
}finally{for(const c of clients)c.auth.stopAutoRefresh();admin.auth.stopAutoRefresh();globalThis.fetch=originalFetch}
