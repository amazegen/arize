// Loopback-only Auth/PostgREST MODEL backed by real local SQL/RLS. This is not
// the GoTrue/PostgREST/Realtime services and is NOT hosted acceptance evidence.
import {createServer} from 'node:http'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHmac,createHash,randomUUID} from 'node:crypto'
const run=promisify(execFile),socket=process.env.ARIZE_TEST_SOCKET
if(!process.argv.includes('--synthetic-only')||!/^\/private\/tmp\/arize-native\.[A-Za-z0-9]+$/.test(socket??''))throw new Error('Disposable native socket + synthetic flag required')
const db=process.env.ARIZE_TEST_DATABASE??'native_tests';if(!/^native_(tests|final|review)$/.test(db))throw new Error('Disposable native test database only')
const query=async sql=>(await run('/opt/homebrew/bin/psql',['-XAtq','-h',socket,'-p','55481','-U','arize_native_test','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-c',sql],{timeout:10000})).stdout.trim()
if(await query("select current_database()||':'||to_regprocedure('public.native_session_context()')::text")!==`${db}:native_session_context()`)throw new Error('Local native schema missing')
const quote=value=>value==null?'null':`'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")}'`
const identifier=value=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error('Invalid fixture identifier');return `"${value}"`}
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'http://127.0.0.1:3183','access-control-allow-headers':'authorization,apikey,content-type,x-client-info,prefer,range,x-supabase-api-version','access-control-allow-methods':'GET,HEAD,POST,PATCH,DELETE,OPTIONS'});res.end(JSON.stringify(value))}
const tokens=new Map(),refreshes=new Map(),passwords=new Map(),pending=new Map();const stats={moderations:0,generations:0,emails:0}
for(const row of JSON.parse(await query("select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email)),'[]') from auth.users where email like '%@example.test'")))passwords.set(row.email,{id:row.id,password:'native-fixture-only',confirmed:true})
async function userFor(record){const factors=JSON.parse(await query(`select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'factor_type','totp')),'[]') from auth.mfa_factors where user_id=${quote(record.id)}::uuid`));return {id:record.id,email:record.email,aud:'authenticated',role:'authenticated',is_anonymous:false,email_confirmed_at:record.confirmed===false?null:new Date().toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_sign_in_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],factors}}
async function session(record,sid= randomUUID(),aal='aal1'){
 await query(`insert into auth.sessions(id,user_id) values(${quote(sid)},${quote(record.id)}) on conflict do nothing`)
 const now=Math.floor(Date.now()/1000),head=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),payload=Buffer.from(JSON.stringify({sub:record.id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600,session_id:sid,aal,jti:randomUUID()})).toString('base64url')
 const token=`${head}.${payload}.${createHmac('sha256','fictional-native-signing-only').update(`${head}.${payload}`).digest('base64url')}`,refresh=randomUUID(),stored={...record,sid,aal}
 tokens.set(token,stored);refreshes.set(refresh,stored)
 return {access_token:token,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:now+3600,user:await userFor(record)}
}
const signatures={native_session_context:[],native_accept_ai_disclosure:[],record_legal_consent:[],membership_rollout_state:[],join_village_room:['target_room_id'],consume_coach_quota_for_plan:['p_daily_limit','p_monthly_limit'],clarity_active_config:['p_edition'],native_claim_turn:['p_user','p_session','p_request','p_conversation','p_hash'],native_finish_turn:['p_user','p_session','p_request','p_token','p_input','p_reply','p_blocked'],claim_billing_operation:['p_user','p_token'],release_billing_operation:['p_user','p_token'],billing_owned_storage_page:['p_user']}
const tables=new Set(['profiles','goals','legal_consents','check_ins','coach_conversations','coach_messages','village_rooms','village_memberships','village_messages','access_grants','account_deletion_jobs','billing_customers'])
function projection(select){
 if(select==='*')return 'to_jsonb(t)'
 const parts=select.split(/,(?![^()]*\))/),fields=[]
 for(const part of parts){if(part==='profiles(name,username)'){fields.push("'profiles',(select jsonb_build_object('name',p.name,'username',p.username) from public.profiles p where p.id=t.user_id)")}else{identifier(part);fields.push(`${quote(part)},t.${identifier(part)}`)}}
 return `jsonb_build_object(${fields.join(',')})`
}
function where(url){const conditions=[];for(const [field,value]of url.searchParams){if(['select','order','limit'].includes(field))continue;if(field==='or'){const match=value.match(/^\((created_at|updated_at)\.lt\.([^,]+),and\(\1\.eq\.([^,]+),id\.lt\.([a-f0-9-]{36})\)\)$/i);if(!match)throw new Error('Unsupported fixture cursor');const column=identifier(match[1]);conditions.push(`(${column}<${quote(match[2])} or (${column}=${quote(match[3])} and id<${quote(match[4])}::uuid))`);continue}const match=value.match(/^(eq|neq|lt|lte|gt|gte|in)\.(.*)$/s);if(!match)throw new Error('Unsupported fixture filter');const column=identifier(field),operator={eq:'=',neq:'<>',lt:'<',lte:'<=',gt:'>',gte:'>='}[match[1]];conditions.push(match[1]==='in'?`${column} in (${match[2].replace(/^\(|\)$/g,'').split(',').map(quote).join(',')})`:`${column}${operator}${quote(match[2])}`)}return conditions.length?' where '+conditions.join(' and '):''}
createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:3186')return json(res,403,{})
  const url=new URL(req.url,'http://127.0.0.1:3186');if(req.method==='OPTIONS')return json(res,200,{})
  let raw='';for await(const part of req){raw+=part;if(raw.length>100000)return json(res,413,{})}const body=raw?JSON.parse(raw):{}
  const token=req.headers.authorization?.replace(/^Bearer /,''),isService=token==='synthetic-native-service',record=tokens.get(token)
  if(url.pathname.startsWith('/fixture/openai/')){
   if(token!=='fictional-local-ai-not-valid')return json(res,403,{})
   if(url.pathname.endsWith('/moderations')){stats.moderations++;const blocked=/fixture-crisis|fixture-unsafe-output/.test(String(body.input));return json(res,200,{id:'fictional-mod',model:'fictional',results:[{flagged:blocked,categories:{'self-harm/intent':blocked},category_scores:{}}]})}
   stats.generations++;return json(res,200,{id:'fictional-completion',choices:[{message:{role:'assistant',content:body.messages?.at(-1)?.content.includes('make unsafe output')?'fixture-unsafe-output':'Let’s choose one small next step. What would make the next few minutes easier?'}}]})
  }
  if(url.pathname==='/fixture/stats'){if(!isService)return json(res,403,{});return json(res,200,stats)}
  if(url.pathname==='/fixture/next-link'){if(!isService)return json(res,403,{});const entry=[...pending].at(-1);return json(res,200,entry?{code:entry[0],purpose:entry[1].purpose}:null)}
  if(url.pathname==='/auth/v1/token'){
   if(url.searchParams.get('grant_type')==='password'){const found=passwords.get(body.email);if(!found||found.password!==body.password||!found.confirmed)return json(res,400,{msg:'Fictional email/password not accepted'});return json(res,200,await session({...found,email:body.email}))}
   if(url.searchParams.get('grant_type')==='refresh_token'){const old=refreshes.get(body.refresh_token);if(!old||!(await query(`select 1 from auth.sessions where id=${quote(old.sid)}::uuid`)))return json(res,400,{msg:'Fictional session revoked'});return json(res,200,await session(old,old.sid,old.aal))}
   if(url.searchParams.get('grant_type')==='pkce'){const flow=pending.get(body.auth_code);if(!flow||createHash('sha256').update(body.code_verifier??'').digest('base64url')!==flow.challenge)return json(res,400,{msg:'PKCE verifier rejected'});pending.delete(body.auth_code);const found=passwords.get(flow.email);found.confirmed=true;return json(res,200,await session({...found,email:flow.email}))}
  }
  if(url.pathname==='/auth/v1/signup'){
   if(!body.email?.endsWith('@example.test'))return json(res,403,{msg:'Fictional emails only'})
   if(passwords.has(body.email))return json(res,200,{user:await userFor({...passwords.get(body.email),email:body.email}),session:null})
   const id=randomUUID();await query(`insert into auth.users(id,email,raw_user_meta_data) values(${quote(id)},${quote(body.email)},${quote(body.data??{})}::jsonb)`);passwords.set(body.email,{id,password:body.password,confirmed:false});pending.set(randomUUID().replaceAll('-',''),{email:body.email,challenge:body.code_challenge,purpose:'signup'});stats.emails++;return json(res,200,{user:await userFor({id,email:body.email,confirmed:false}),session:null})
  }
  if(url.pathname==='/auth/v1/recover'){if(body.email?.endsWith('@example.test')&&passwords.has(body.email)){pending.set(randomUUID().replaceAll('-',''),{email:body.email,challenge:body.code_challenge,purpose:'recovery'});stats.emails++}return json(res,200,{})}
  if(url.pathname==='/auth/v1/user'){
   if(!record||!(await query(`select 1 from auth.users where id=${quote(record.id)}::uuid`)))return json(res,401,{msg:'Fictional sign-in required'})
   if(req.method==='PUT'&&body.password)passwords.get(record.email).password=body.password
   return json(res,200,await userFor(record))
  }
  if(url.pathname==='/auth/v1/logout'){
   if(!record)return json(res,401,{msg:'Fictional session not found'})
   await query(`delete from auth.sessions where ${url.searchParams.get('scope')==='global'?`user_id=${quote(record.id)}::uuid`:`id=${quote(record.sid)}::uuid`}`);return json(res,200,{})
  }
  const factor=url.pathname.match(/^\/auth\/v1\/factors\/([a-f0-9-]{36})\/(challenge|verify)$/i)
  if(factor&&record){
   const owns=await query(`select 1 from auth.mfa_factors where id=${quote(factor[1])}::uuid and user_id=${quote(record.id)}::uuid and status='verified'`)
   if(!owns)return json(res,403,{msg:'Fictional factor not found'})
   if(factor[2]==='challenge')return json(res,200,{id:randomUUID(),type:'totp',expires_at:Math.floor(Date.now()/1000)+300})
   if(body.code!=='123456')return json(res,400,{msg:'Fictional verification code rejected'})
   return json(res,200,await session(record,record.sid,'aal2'))
  }
  if(url.pathname.startsWith('/auth/v1/admin/users/')&&req.method==='DELETE'&&isService){const userId=url.pathname.split('/').at(-1);if(!/^[a-f0-9-]{36}$/i.test(userId))return json(res,400,{});await query(`delete from auth.users where id=${quote(userId)}::uuid and email like '%@example.test'`);return json(res,200,{})}
  if(!isService&&!record)return json(res,401,{message:'Fictional session required'})
  const prefix=isService?'begin;set local role service_role;':`begin;set local role authenticated;set local request.jwt.claim.sub=${quote(record.id)};set local request.jwt.claim.session_id=${quote(record.sid)};set local request.jwt.claim.aal=${quote(record.aal)};`
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const name=url.pathname.split('/').at(-1);if(!Object.hasOwn(signatures,name)||Object.keys(body).some(k=>!signatures[name].includes(k)))return json(res,404,{})
   const value=await query(`${prefix}select to_jsonb(public.${name}(${signatures[name].map(key=>quote(body[key])).join(',')}));commit;`);return json(res,200,value?JSON.parse(value):null)
  }
  const table=url.pathname.split('/').at(-1);if(!url.pathname.startsWith('/rest/v1/')||!tables.has(table))return json(res,404,{})
  const selected=projection(url.searchParams.get('select')??'*'),filter=where(url),order=url.searchParams.get('order')?.split(',').map(value=>{const [name,direction]=value.split('.');if(!['asc','desc'].includes(direction))throw new Error('Unsupported order');return `${identifier(name)} ${direction}`}).join(','),limit=Math.min(Number(url.searchParams.get('limit')??200),500)
  let statement
  if(req.method==='GET'||req.method==='HEAD')statement=`select ${selected} value from public.${identifier(table)} t${filter}${order?' order by '+order:''} limit ${limit}`
  else if(req.method==='POST'){const fields=Object.keys(body);statement=`with changed as(insert into public.${identifier(table)}(${fields.map(identifier)}) values(${fields.map(key=>quote(body[key]))}) returning *) select ${selected} value from changed t`}
  else if(req.method==='PATCH')statement=`with changed as(update public.${identifier(table)} set ${Object.entries(body).map(([key,value])=>`${identifier(key)}=${quote(value)}`).join(',')}${filter} returning *) select ${selected} value from changed t`
  else if(req.method==='DELETE')statement=`with changed as(delete from public.${identifier(table)}${filter} returning *) select ${selected} value from changed t`
  else return json(res,405,{})
  const aggregated=['GET','HEAD'].includes(req.method)?`select coalesce(jsonb_agg(value),'[]') from (${statement}) result`:statement.replace(`select ${selected} value from changed t`,`select coalesce(jsonb_agg(${selected}),'[]') from changed t`)
  const rows=JSON.parse(await query(`${prefix}${aggregated};commit;`))
  return json(res,200,req.headers.accept?.includes('vnd.pgrst.object')?rows[0]??null:rows)
 }catch(error){return json(res,400,{code:String(error.stderr??'').match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'fixture_error',message:'Local SQL request rejected'})}
}).listen(3186,'127.0.0.1',()=>console.log('Native loopback Auth/REST model + real SQL at 127.0.0.1:3186. Fictional accounts only.'))
