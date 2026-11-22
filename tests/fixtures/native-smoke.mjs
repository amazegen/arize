import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createAccounts} from '../../apps/mobile/src/account/client.ts'
import {mobileConfig} from '../../apps/mobile/src/account/config.ts'
if(!process.argv.includes('--synthetic-only')||!/^\/private\/tmp\/arize-native\.[A-Za-z0-9]+$/.test(process.env.ARIZE_TEST_SOCKET??''))throw new Error('Disposable local native fixture required')
const backend='http://127.0.0.1:3186',app='http://127.0.0.1:3187',origin='http://127.0.0.1:3183'
const db=process.env.ARIZE_TEST_DATABASE??'native_tests';if(!/^native_(tests|final|review)$/.test(db))throw new Error('Disposable native test database only')
const sql=statement=>execFileSync('/opt/homebrew/bin/psql',['-XAtq','-h',process.env.ARIZE_TEST_SOCKET,'-p','55481','-U','arize_native_test','-d',db,'-v','ON_ERROR_STOP=1','-c',statement],{encoding:'utf8',timeout:10000}).trim()
const config=mobileConfig({VITE_NATIVE_ENABLED:'true',VITE_ARIZE_EDITION:'adult',VITE_NATIVE_LOCAL_TEST:'true',VITE_ADULT_SUPABASE_URL:backend,VITE_ADULT_API_ORIGIN:app,VITE_ADULT_SUPABASE_PUBLISHABLE_KEY:'synthetic-native-anon'},false)
const clients=[]
async function login(email){const c=createAccounts(config);clients.push(c);const result=await c.client.auth.signInWithPassword({email,password:'native-fixture-only'});assert.equal(result.error,null);return c}
async function token(c){return (await c.client.auth.getSession()).data.session.access_token}
async function api(path,c,method='GET',body,extra={}){return fetch(`${app}/api/native/v1${path}`,{method,headers:{origin,...(c?{authorization:`Bearer ${await token(c)}`}:{cookie:'must-not-authenticate'}),...(body?{'content-type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})})}
const stats=async()=>(await(await fetch(backend+'/fixture/stats',{headers:{authorization:'Bearer synthetic-native-service'}})).json())
try{
 assert.equal((await api('/session',null)).status,401)
 const a=await login('native@example.test'),b=await login('other@example.test')
 assert.equal((await api('/session',a,'GET',undefined,{origin:'https://evil.test'})).status,403)
 const preflight=await fetch(app+'/api/native/v1/goals',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}})
 assert.equal(preflight.status,200);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.equal(preflight.headers.get('access-control-allow-credentials'),null)
 const session=await a.session();assert.equal(session.user.email,'native@example.test');assert.equal(session.profile.onboarded,true);assert.equal(session.access.billingEnabled,false)
 const response=await api('/session',a);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(JSON.stringify(await response.json()),/sessionId|startedAt|refresh_token|service_role|billing_customers/)
 assert.equal((await fetch(app+'/api/native/v1/goals',{method:'POST',headers:{origin,authorization:`Bearer ${await token(a)}`,'content-type':'application/json'},body:'{broken'})).status,400)
 const today=new Date(),start=new Date(today);start.setDate(start.getDate()-start.getDay());const week=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`
 const goal={id:randomUUID(),title:'Fictional goal flow',category:'Personal',week_of:week,deadline:null,notes:'Local fixture only'}
 assert.equal((await api('/goals',a,'POST',{...goal,user_id:'forged'})).status,400)
 assert.equal((await api('/goals',a,'POST',goal)).status,200)
 assert.equal((await api('/goals',a,'PATCH',{id:goal.id,is_complete:true})).status,200)
 assert.equal((await api('/goals',a,'POST',goal)).status,200)
 let list=await a.request(`/goals?week=${week}`);assert.equal(list.goals.find(g=>g.id===goal.id).is_complete,true)
 assert.equal((await api('/goals',b,'PATCH',{id:goal.id,is_complete:false})).status,404)
 assert.equal((await api('/goals',a,'PATCH',{...goal,title:'Edited without clearing completion'})).status,200)
 list=await a.request(`/goals?week=${week}`);assert.equal(list.goals.find(g=>g.id===goal.id).is_complete,true)
 assert.equal((await api('/goals',a,'DELETE',{id:goal.id})).status,200)
 const room='74000000-0000-4000-8000-000000000001'
 assert.equal((await api(`/village?room=${room}`,a)).status,403)
 assert.equal((await api('/village',a,'POST',{action:'join',roomId:room})).status,200)
 const message={action:'send',roomId:room,id:randomUUID(),content:'Fictional native text message'}
 assert.equal((await api('/village',a,'POST',{...message,message_type:'audio'})).status,400)
 assert.equal((await api('/village',a,'POST',message)).status,200);assert.equal((await api('/village',a,'POST',message)).status,200)
 const messages=await a.request(`/village?room=${room}`);assert.equal(messages.messages.filter(m=>m.id===message.id).length,1)
 assert.equal((await api(`/village?room=${room}`,b)).status,403)
 const chat={requestId:randomUUID(),conversationId:randomUUID(),message:'Fictional conversation for local integration testing'}
 const before=await stats(),first=await api('/coach',a,'POST',chat);assert.equal(first.status,200);const firstBody=await first.json();assert.match(firstBody.reply,/one small next step/)
 const again=await api('/coach',a,'POST',chat);assert.equal(again.status,200);assert.equal((await again.json()).reply,firstBody.reply);assert.equal((await stats()).generations,before.generations+1)
 assert.equal((await api('/coach',b,'POST',{...chat,requestId:randomUUID()})).status,403)
 const saved=await a.request(`/coach?conversation=${chat.conversationId}`);assert.equal(saved.messages.length,2)
 assert.equal((await api('/coach',a,'POST',{...chat,requestId:randomUUID(),message:'Continue this fictional saved conversation'})).status,200)
 assert.equal((await a.request(`/coach?conversation=${chat.conversationId}`)).messages.length,4)
 assert.equal((await api(`/coach?conversation=${chat.conversationId}`,b)).status,404)
 const unsafe={requestId:randomUUID(),conversationId:randomUUID(),message:'fixture-crisis'}
 const blocked=await api('/coach',a,'POST',unsafe);assert.equal(blocked.status,200);const safety=await blocked.json();assert.equal(safety.blocked,true);assert.match(safety.reply,/988/)
 assert.equal((await api(`/coach?conversation=${unsafe.conversationId}`,a)).status,404)
 const setup=await login('setup@example.test');assert.equal((await api(`/goals?week=${week}`,setup)).status,403)
 assert.equal((await api('/legal',setup,'POST',{accepted:true})).status,200)
 assert.equal((await api('/account',setup,'PATCH',{name:'Fictional Setup Reviewer',username:'fixture_setup'})).status,200)
 assert.equal((await api('/account',setup,'PATCH',{name:'No role promotion',username:'fixture_setup',role:'admin'})).status,400)
 assert.equal((await api('/ai-consent',setup,'POST',{accepted:true,version:'adult-native-ai-2026-11-22'})).status,200)
 assert.equal((await setup.session()).consented,true)
 // Actual local SQL proves the gateway rejects an otherwise-valid old JWT.
 const sid=JSON.parse(Buffer.from((await token(a)).split('.')[1],'base64url').toString()).session_id
 sql(`delete from auth.sessions where id='${sid}'::uuid`);assert.equal((await api('/session',a)).status,401)
 // Native signup confirmation and password reset use the actual SDK's PKCE
 // verifier against the local protocol model, not a real email/provider.
 const fresh=createAccounts(config);clients.push(fresh);const email=`native-signup-${randomUUID().slice(0,8)}@example.test`
 await fresh.beginFlow('signup');const created=await fresh.client.auth.signUp({email,password:'fictional-passphrase-only',options:{emailRedirectTo:config.callback,data:{full_name:'Fictional New Reviewer'}}});assert.equal(created.error,null)
 let link=await(await fetch(backend+'/fixture/next-link',{headers:{authorization:'Bearer synthetic-native-service'}})).json();assert.equal(await fresh.handleLink(config.callback+'?code='+link.code),'signup')
 assert.equal((await fresh.session()).profile.onboarded,false)
 await fresh.signOut();await fresh.beginFlow('recovery');const reset=await fresh.client.auth.resetPasswordForEmail(email,{redirectTo:config.callback});assert.equal(reset.error,null)
 link=await(await fetch(backend+'/fixture/next-link',{headers:{authorization:'Bearer synthetic-native-service'}})).json();assert.equal(await fresh.handleLink(config.callback+'?code='+link.code),'recovery')
 assert.equal((await fresh.client.auth.updateUser({password:'changed-fictional-passphrase-only'})).error,null);await fresh.signOut()
 assert.equal((await fresh.client.auth.signInWithPassword({email,password:'changed-fictional-passphrase-only'})).error,null)
 // Fresh confirmed deletion, no Stripe customer: no Stripe call is possible.
 const doomed=await login('delete@example.test');assert.equal((await api('/account',doomed,'DELETE',{confirmation:'wrong',acknowledged:true})).status,400)
 const removed=await api('/account',doomed,'DELETE',{confirmation:'DELETE MY ACCOUNT',acknowledged:true});assert.equal(removed.status,200);assert.deepEqual(await removed.json(),{deleted:true})
 assert.equal(sql("select count(*) from auth.users where id='73000000-0000-4000-8000-000000000004'"),'0')
 console.log('Native local SDK + HTTP + real SQL smoke passed: bearer/CORS, profile/legal, goal preservation/ownership, text-room access/dedupe, checked AI/history/retry, crisis gate, revoked sessions, PKCE signup/reset and account deletion. Only fictional data and mocked AI/Auth services used; no real emails, Stripe, hosted DB or Apple operations.')
}finally{for(const c of clients){c.clearPrivate();c.client.auth.stopAutoRefresh()}}
