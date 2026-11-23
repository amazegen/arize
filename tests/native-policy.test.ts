import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {nativeEnabled,nativeOrigin,nativeHeaders,bearer,nativeBody,cursor,messageCursor} from '../lib/native/policy.ts'
import {goalDraft,validDate} from '../lib/native/contracts.ts'
const env={ARIZE_EDITION:'adult',NATIVE_API_ENABLED:'true',NATIVE_ALLOWED_ORIGINS:'capacitor://localhost,http://127.0.0.1:3183'}
test('native gateway is off by default, adult-only, and never trusts wildcard/null origins or cookies as bearer',()=>{
 assert.equal(nativeEnabled({}),false);assert.equal(nativeEnabled(env),true);assert.equal(nativeEnabled({...env,ARIZE_EDITION:'student'}),false)
 assert.equal(nativeEnabled({NATIVE_API_ENABLED:'true'}),false)
 for(const origin of ['capacitor://localhost','http://127.0.0.1:3183',null])assert.equal(nativeOrigin(origin,env),true)
 for(const origin of ['null','capacitor://evil','http://127.0.0.1:3184','https://evil.test'])assert.equal(nativeOrigin(origin,env),false)
 assert.equal(nativeOrigin('https://evil.test',{...env,NATIVE_ALLOWED_ORIGINS:'*'}),false)
 assert.equal(bearer(new Request('https://api.test',{headers:{cookie:'session=private'}})),null)
 assert.equal(bearer(new Request('https://api.test',{headers:{authorization:'Bearer aaa.bbb.ccc'}})),'aaa.bbb.ccc')
 assert.equal(bearer(new Request('https://api.test',{headers:{authorization:'Bearer '+ 'a'.repeat(9000)}})),null)
 const headers=nativeHeaders(new Request('https://api.test',{headers:{origin:'https://evil.test'}}),env)
 assert.equal(headers['Access-Control-Allow-Origin'],undefined);assert.equal(headers['Cache-Control'],'private, no-store');assert.match(headers.Vary,/Authorization/)
})
test('saved-message cursors retain bigint identities without floating-point rounding',()=>{
 const encode=(id:unknown)=>Buffer.from(JSON.stringify({at:'2026-11-22T00:00:00Z',id})).toString('base64url')
 assert.equal(messageCursor(null),null)
 assert.equal(messageCursor(encode('9223372036854775807'))?.id,'9223372036854775807')
 for(const id of ['0','-1','1.2','9223372036854775808','1),user_id.eq.forged',123])assert.throws(()=>messageCursor(encode(id)))
})
test('goal draft allows only existing adult fields and does not accept completion resets/owner injection',()=>{
 const value={id:'71000000-0000-4000-8000-000000000003',title:'  One small step ',category:'Personal',deadline:'2026-11-24',week_of:'2026-11-22',notes:null}
 assert.equal(goalDraft(value)?.title,'One small step')
 for(const extra of [{is_complete:false},{user_id:'forged'},{role:'admin'},{deadline:'2026-11-29'},{week_of:'2026-11-23'},{title:''},{category:'Deliverable'}])assert.equal(goalDraft({...value,...extra}),null)
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true)
})
test('native request parser and pagination reject oversized/private/invalid query structures',async()=>{
 const request=(body:string)=>new Request('https://api.test',{method:'POST',headers:{'content-type':'application/json'},body})
 assert.deepEqual(await nativeBody(request('{"accepted":true}')),{accepted:true})
 for(const body of ['[]','null','{broken','x'.repeat(65537)])await assert.rejects(nativeBody(request(body)))
 assert.equal(cursor(null),null);assert.throws(()=>cursor('bad'))
 const value={at:'2026-11-22T15:30:00.000Z',id:'71000000-0000-4000-8000-000000000001'}
 assert.deepEqual(cursor(Buffer.from(JSON.stringify(value)).toString('base64url')),value)
 assert.throws(()=>cursor(Buffer.from(JSON.stringify({...value,at:'2026-11-22),user_id.eq.forged'})).toString('base64url')))
})
test('native feature wiring keeps RLS identity, safety/persistence ordering, no private logs, Student isolation and no native purchases',()=>{
 const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
 const server=read('lib/native/server.ts'),features=read('lib/native/features.ts'),route=read('app/api/native/v1/[...path]/route.ts'),generation=read('lib/clarity/adult-generation.ts')
 assert.match(server,/auth.getUser\(token\)/);assert.match(server,/native_session_context/);assert.doesNotMatch(server,/user_metadata|console\./)
 assert.ok(features.indexOf('generateAdultReply(db')<features.indexOf('finish(result.inputBlocked'))
 assert.match(features,/message_type:'text'/);assert.doesNotMatch(features,/getPublicUrl|storage\.from|MediaRecorder|console\./)
 assert.match(generation,/safeCompletion/);assert.match(generation,/store: false/);assert.match(route,/admin.auth.admin.signOut/)
 assert.ok(route.indexOf('validDeletionBody(body)')<route.indexOf('admin.auth.admin.signOut'))
 assert.ok(route.indexOf('admin.auth.admin.signOut')<route.indexOf('deletionWorkflow({'))
 assert.match(read('vercel.json'),/"codex\/phase-7-native-features": false/)
 assert.match(read('.env.example'),/NATIVE_API_ENABLED=false/)
 assert.match(read('apps/mobile/.env.example'),/VITE_NATIVE_ENABLED=false/)
 const ui=read('apps/mobile/src/NativeApp.tsx')+read('apps/mobile/src/account/ProfileScreen.tsx')
 assert.doesNotMatch(ui,/checkout|billingPortal|stripe\.com|students\.arizeapp/i)
})
