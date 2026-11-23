import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createAccounts} from '../../apps/mobile/src/account/client.ts'
import {localServices} from './native-services-env.mjs'
if(!process.argv.includes('--synthetic-only'))throw new Error('Local fictional review only')
const state=localServices(),email='review-native@example.test',password='Local-fixture-only-123456!'
const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const checked=async pending=>{const result=await pending;if(result.error)throw new Error('Local reviewer setup failed: '+result.error.code);return result.data}
const users=await checked(admin.auth.admin.listUsers({perPage:1000}))
let user=users.users.find(user=>user.email===email)
if(!user)user=(await checked(admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Local Native Reviewer'}}))).user
const c=createAccounts({supabaseUrl:state.API_URL,apiOrigin:'http://127.0.0.1:3190',publicKey:state.ANON_KEY,localTest:true,google:false,callback:'com.amazegen.arize.dev://auth/callback'})
try{
 await checked(c.client.auth.signInWithPassword({email,password}))
 await c.request('/legal','POST',{accepted:true});await c.request('/account','PATCH',{name:'Local Native Reviewer',username:''});await c.request('/ai-consent','POST',{accepted:true,version:'adult-native-ai-2026-11-22'})
 if(!(await checked(admin.from('access_grants').select('id').eq('user_id',user.id).eq('source','admin'))).length)await checked(admin.from('access_grants').insert({user_id:user.id,plan:'plus',source:'admin',status:'active',starts_at:new Date().toISOString(),ends_at:null}))
 let saved=(await checked(admin.from('coach_conversations').select('id').eq('user_id',user.id).eq('title','Long local chat review')))[0]
 if(!saved){saved={id:randomUUID()};await checked(admin.from('coach_conversations').insert({id:saved.id,user_id:user.id,title:'Long local chat review'}));await checked(admin.from('coach_messages').insert(Array.from({length:205},(_,index)=>({conversation_id:saved.id,user_id:user.id,role:index%2?'assistant':'user',content:'Fictional saved message '+(index+1),created_at:'2026-11-22T00:00:00Z'}))))}
 const room='74000000-0000-4000-8000-000000000001'
 await checked(admin.from('village_rooms').upsert({id:room,name:'Local Review Room',description:'Fictional local text chat only.'}))
 await c.request('/village','POST',{action:'join',roomId:room})
 console.log('Local fictional reviewer ready: review-native@example.test / Local-fixture-only-123456!')
}finally{await c.signOut();c.client.auth.stopAutoRefresh()}
