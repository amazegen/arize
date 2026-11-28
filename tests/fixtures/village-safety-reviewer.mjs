// Fictional UI data only, guarded by the same loopback-only stack checks.
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {localServices,localSql} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Local fictional UI seed only')
const env=localServices();if(localSql('select edition from public.clarity_installation')!=='adult')throw new Error('Adult only')
const original=globalThis.fetch
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.origin!==env.API_URL)throw new Error('Hosted targets refused');return original(input,init)}
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const peer=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
async function ok(value){const result=await value;if(result.error)throw new Error('Local seed rejected: '+result.error.code);return result.data}
try{
 const email=`safety-ui-${randomUUID().slice(0,8)}@example.test`,password='Local-fixture-only-123456!'
 const {user}=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}))
 await ok(peer.auth.signInWithPassword({email,password}));await ok(peer.rpc('record_legal_consent'))
 await ok(peer.from('profiles').update({name:'Fictional safety author',onboarded:true}).eq('id',user.id))
 await ok(admin.from('access_grants').insert({user_id:user.id,plan:'plus',source:'admin',status:'active',starts_at:new Date().toISOString()}))
 await ok(peer.rpc('join_village_room',{target_room_id:'74000000-0000-4000-8000-000000000001'}))
 await ok(peer.from('village_messages').insert({room_id:'74000000-0000-4000-8000-000000000001',user_id:user.id,content:'Fictional message for safety controls.'}))
 console.log('Added a fictional author/message to Local Review Room; no real account changed.')
}finally{admin.auth.stopAutoRefresh();peer.auth.stopAutoRefresh();globalThis.fetch=original}
