import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {mobileConfig,authCallback} from '../src/account/config.ts'
import {accountStorage,AUTH_STORAGE_KEY,FLOW_KEY,clearAccountStorage} from '../src/account/storage.ts'
import {createAccounts} from '../src/account/client.ts'
const env={VITE_NATIVE_ENABLED:'true',VITE_ARIZE_EDITION:'adult',VITE_NATIVE_LOCAL_TEST:'true',VITE_ADULT_SUPABASE_URL:'http://127.0.0.1:3186',VITE_ADULT_API_ORIGIN:'http://127.0.0.1:3187',VITE_ADULT_SUPABASE_PUBLISHABLE_KEY:'synthetic-native-anon'}
test('native configuration rejects insecure/Student/secret-key targets; local fixtures are browser-only',()=>{
 assert.equal(mobileConfig({},false),null);assert.ok(mobileConfig(env,false));assert.throws(()=>mobileConfig(env,true))
 for(const extra of [{VITE_ARIZE_EDITION:'student'},{VITE_ADULT_API_ORIGIN:'https://students.arizeapp.com'},{VITE_ADULT_SUPABASE_PUBLISHABLE_KEY:'sb_secret_not_a_real_key'},{VITE_ADULT_API_ORIGIN:'https://api.test/path'},{VITE_ADULT_API_ORIGIN:'https://name:password@api.test'}])assert.throws(()=>mobileConfig({...env,...extra},false))
})
test('authentication callback is code-only, exact-destination and rejects token fragments/open redirects',()=>{
 const callback='com.amazegen.arize.dev://auth/callback',code='fictional_callback_code_12345'
 assert.equal(authCallback(`${callback}?code=${code}`,callback),code)
 for(const value of [`https://evil.test/auth/callback?code=${code}`,`${callback}?code=${code}&next=https://evil.test`,`${callback}?code=${code}#access_token=private`,`${callback}?code=${code}&code=again`,`${callback}/extra?code=${code}`,`${callback}?code=short`])assert.throws(()=>authCallback(value,callback))
})
test('loopback native transport requires both explicit test JS and a native Debug simulator gate',()=>{
 const fixture={...env,VITE_NATIVE_SIMULATOR_TEST:'true',VITE_ADULT_SUPABASE_URL:'http://127.0.0.1:56581',VITE_ADULT_API_ORIGIN:'http://127.0.0.1:3190'}
 assert.throws(()=>mobileConfig(fixture,true))
 assert.throws(()=>mobileConfig(env,true,true))
 assert.ok(mobileConfig(fixture,true,true)?.localTest)
 for(const extra of [{VITE_ARIZE_EDITION:'student'},{VITE_ADULT_API_ORIGIN:'http://192.168.1.20:3190'},{VITE_ADULT_API_ORIGIN:'https://api.test'},{VITE_ADULT_SUPABASE_URL:'https://hosted.supabase.co'},{VITE_ADULT_API_ORIGIN:'http://127.0.0.1:3187'},{VITE_NATIVE_LOCAL_TEST:'false'}])assert.throws(()=>mobileConfig({...fixture,...extra},true,true))
 const swift=readFileSync(new URL('../ios/App/App/ArizeKeychain.swift',import.meta.url),'utf8')
 assert.match(swift,/#if DEBUG && targetEnvironment\(simulator\) && ARIZE_SIMULATOR_TEST/)
 assert.match(swift,/#else\s+call.resolve\(\["simulatorFixture": false\]\)/)
})
test('browser review storage is memory-only and isolated per account client',async()=>{
 const a=accountStorage(),b=accountStorage();await a.setItem(AUTH_STORAGE_KEY,'fictional-session')
 assert.equal(await a.getItem(AUTH_STORAGE_KEY),'fictional-session');assert.equal(await b.getItem(AUTH_STORAGE_KEY),null)
 await a.setItem(FLOW_KEY,'fictional-flow');await clearAccountStorage(a);assert.equal(await a.getItem(AUTH_STORAGE_KEY),null);assert.equal(await a.getItem(FLOW_KEY),null)
 const source=readFileSync(new URL('../src/account/storage.ts',import.meta.url),'utf8')
 assert.doesNotMatch(source,/localStorage\.|sessionStorage\.|Preferences\.|indexedDB\./)
})
test('connected simulator helper keeps loopback ATS and Debug-only unsigned builds out of the normal plist',()=>{
 const source=readFileSync(new URL('../../../tests/fixtures/native-services-simulator.mjs',import.meta.url),'utf8')
 assert.match(source,/--synthetic-only/);assert.match(source,/localServices\(\)/)
 assert.match(source,/'127\.0\.0\.1':\{NSExceptionAllowsInsecureHTTPLoads:true,NSIncludesSubdomains:false\}/)
 assert.doesNotMatch(source,/NSAllowsArbitraryLoads|allowProvisioningUpdates|'archive'|'upload'/)
 assert.match(source,/'-configuration','Debug'/);assert.match(source,/CODE_SIGNING_ALLOWED=NO/)
 assert.match(source,/SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG ARIZE_SIMULATOR_TEST/)
 assert.match(source,/SimulatorFixture-Info\.plist/)
})
test('Keychain is device-only, scoped, explicitly registered and used by the actual scene root',()=>{
 const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
 const swift=read('ios/App/App/ArizeKeychain.swift')
 assert.match(swift,/kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);assert.match(swift,/key.hasPrefix\("arize.native.adult."\)/);assert.match(swift,/kSecAttrSynchronizable as String: false/);assert.doesNotMatch(swift,/print\(|NSLog/)
 assert.match(read('ios/App/App/ArizeViewController.swift'),/registerPluginInstance\(ArizeKeychainPlugin\(\)\)/)
 assert.match(read('ios/App/App/SceneDelegate.swift'),/rootViewController = ArizeViewController\(\)/)
 assert.match(read('capacitor.config.ts'),/loggingBehavior: 'none'/)
})
test('client sends bearer only to the configured native API and discards late results on account change',async()=>{
 const vault=accountStorage(),now=Math.floor(Date.now()/1000)
 const token=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:'71000000-0000-4000-8000-000000000001',exp:now+3600})).toString('base64url')}.fictional_signature`
 await vault.setItem(AUTH_STORAGE_KEY,JSON.stringify({access_token:token,refresh_token:'fictional-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:'71000000-0000-4000-8000-000000000001'}}))
 const previous=globalThis.fetch;let release:(value:Response)=>void=()=>{};let requested=false
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'http://127.0.0.1:3187/api/native/v1/session');assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),`Bearer ${token}`);requested=true;return new Promise(resolve=>{release=resolve})}
 const accounts=createAccounts(mobileConfig(env,false)!,vault)
 try{
  const pending=accounts.request('/session')
  for(let i=0;i<20&&!requested;i++)await new Promise(resolve=>setImmediate(resolve))
  assert.equal(requested,true);accounts.clearPrivate();release(Response.json({private:'must not reach the next account'}));await assert.rejects(pending,/Account changed/)
  await assert.rejects(accounts.request('/admin/keys'),/Unexpected API path/)
 }finally{accounts.client.auth.stopAutoRefresh();globalThis.fetch=previous;await clearAccountStorage(vault)}
})
test('parallel auth flows are blocked, cancel removes the verifier, and unsolicited callbacks fail',async()=>{
 const accounts=createAccounts(mobileConfig(env,false)!)
 try{await accounts.beginFlow('signup');await assert.rejects(accounts.beginFlow('recovery'),/already in progress/);await accounts.cancelFlow();await accounts.beginFlow('recovery');await accounts.cancelFlow();await assert.rejects(accounts.handleLink(`${accounts.config.callback}?code=fictional_code_12345`),/Start this account request/)}finally{accounts.client.auth.stopAutoRefresh()}
})
