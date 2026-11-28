import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {randomUUID} from 'node:crypto'
import {LOCAL_PUSH_ORIGIN,LOCAL_PUSH_REVISION,localPushPageAllowed,localPushReceipt} from '../lib/notifications/local-diagnostics.ts'
import {inspectLocalPush,installLocalPushDiagnostics} from '../lib/notifications/local-diagnostics-browser.ts'

const source=readFileSync(new URL('../public/push-sw.js',import.meta.url),'utf8')
type FixtureEvent={waitUntil:(task:Promise<unknown>)=>void;[key:string]:unknown}
function worker(origin=LOCAL_PUSH_ORIGIN,store=new Map<string,string>(),fail=false,cacheUnavailable=false){
 const handlers:Record<string,(event:FixtureEvent)=>void>={}
 let shown=0,cacheCalls=0,claimed=0,skipped=0
 const cache={async match(key:string){return store.has(key)?new Response(store.get(key)):undefined},async put(key:string,response:Response){store.set(key,await response.text())}}
 const self={location:{origin},addEventListener(type:string,handler:typeof handlers[string]){handlers[type]=handler},
  async skipWaiting(){skipped++},
  registration:{async showNotification(title:string,options:{body:string}){shown++;assert.equal(title,'Arize');assert.equal(options.body,'A little space for you. Open Arize when you have a moment.');if(fail)throw Object.assign(new Error('private endpoint/key should never be recorded'),{name:'NotAllowedError'})}},
  clients:{async claim(){claimed++},async matchAll(){return []},async openWindow(){return {}}}}
 runInNewContext(source,{self,URL,Response,crypto:{randomUUID},Date,setTimeout,clearTimeout,caches:{async open(){cacheCalls++;if(cacheUnavailable)throw new Error('private cache error');return cache}}})
 async function dispatch(type:string,extra:Record<string,unknown>={}){
  const waits:Promise<unknown>[]=[]
  handlers[type]({waitUntil:(value:Promise<unknown>)=>waits.push(value),...extra})
  await Promise.all(waits)
 }
 async function read(url=LOCAL_PUSH_ORIGIN+'/local/push-diagnostics',data={type:'ARIZE_LOCAL_PUSH_DIAGNOSTICS_READ',version:1}){
  let result:unknown=null
  await dispatch('message',{source:{url},ports:[{postMessage(value:unknown){result=value}}],data})
  return result
 }
 return {handlers,dispatch,read,store,stats:()=>({shown,cacheCalls,claimed,skipped})}
}
test('local diagnostics server gate refuses hosted, Student, disabled and non-loopback installations',()=>{
 const env={ARIZE_EDITION:'adult',ARIZE_LOCAL_PUSH_DIAGNOSTICS:'true',NEXT_PUBLIC_APP_URL:LOCAL_PUSH_ORIGIN,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:56581'}
 assert.equal(localPushPageAllowed(env,'127.0.0.1:3190'),true)
 for(const change of [{ARIZE_EDITION:'student'},{ARIZE_LOCAL_PUSH_DIAGNOSTICS:'false'},{NEXT_PUBLIC_APP_URL:'https://arizeapp.com'},{NEXT_PUBLIC_SUPABASE_URL:'https://hosted.supabase.co'},{VERCEL:'1'}])assert.equal(localPushPageAllowed({...env,...change},'127.0.0.1:3190'),false)
 for(const host of ['localhost:3190','127.0.0.1:3000','example.test','127.0.0.1:3190.evil.test',null])assert.equal(localPushPageAllowed(env,host),false)
})
test('real worker records receive/request/resolved stages, survives restart, and never retains push payloads',async()=>{
 const fixture=worker()
 await fixture.dispatch('install');await fixture.dispatch('activate')
 await fixture.dispatch('push',{data:{json(){throw new Error('Payload must not be read')}}})
 const receipt=localPushReceipt(await fixture.read())!
 assert.ok(receipt);assert.equal(receipt.revision,LOCAL_PUSH_REVISION)
 assert.deepEqual(receipt.events.map(row=>row.stage),['worker_activated','push_received','display_requested','display_resolved'])
 assert.equal(new Set(receipt.events.slice(1).map(row=>row.eventId)).size,1)
 assert.deepEqual(fixture.stats(),{shown:1,cacheCalls:5,claimed:1,skipped:1})
 const restarted=worker(LOCAL_PUSH_ORIGIN,fixture.store)
 assert.deepEqual(localPushReceipt(await restarted.read())!.events,receipt.events)
 assert.equal(restarted.stats().shown,0)
 assert.doesNotMatch(JSON.stringify(receipt),/endpoint|p256dh|payload|private|key|auth/i)
 assert.equal('fetch'in fixture.handlers,false)
})
test('display rejection is recorded with a safe error label and remains a rejected push event',async()=>{
 const fixture=worker(LOCAL_PUSH_ORIGIN,new Map(),true)
 await assert.rejects(fixture.dispatch('push'),{name:'NotAllowedError'})
 const receipt=localPushReceipt(await fixture.read())!
 assert.deepEqual(receipt.events.map(row=>row.stage),['push_received','display_requested','display_failed'])
 assert.equal(receipt.events.at(-1)!.error,'NotAllowedError')
 assert.doesNotMatch(JSON.stringify(receipt),/private|endpoint|key/)
})
test('worker diagnostics and activation shortcuts are inert outside the exact local adult origin',async()=>{
 for(const origin of ['https://arizeapp.com','https://students.arizeapp.com','http://localhost:3190','http://127.0.0.1:3183']){
  const fixture=worker(origin)
  await fixture.dispatch('install');await fixture.dispatch('activate');await fixture.dispatch('push')
  assert.equal(await fixture.read(),null)
  assert.deepEqual(fixture.stats(),{shown:1,cacheCalls:0,claimed:0,skipped:0})
 }
})
test('read protocol cannot trigger notifications and rejects foreign/wrong-path/mutating messages',async()=>{
 const fixture=worker()
 for(const url of ['https://evil.test/local/push-diagnostics',LOCAL_PUSH_ORIGIN+'/settings',LOCAL_PUSH_ORIGIN+'/student'])assert.equal(await fixture.read(url),null)
 assert.equal(await fixture.read(undefined,{type:'SEND_NOTIFICATION',version:1}),null)
 assert.ok(localPushReceipt(await fixture.read()))
 assert.equal(fixture.stats().shown,0)
 const browser=readFileSync(new URL('../lib/notifications/local-diagnostics-browser.ts',import.meta.url),'utf8')
 assert.doesNotMatch(browser,/requestPermission|\.subscribe\(|showNotification|fetch\(|localStorage|sessionStorage|console\./)
})
test('diagnostic browser actions reject hosted origins and refuse to replace another worker',async()=>{
 const saved=Object.fromEntries(['location','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 let registrations=0
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'https://arizeapp.com'}})
  await assert.rejects(inspectLocalPush(),/restricted/)
  await assert.rejects(installLocalPushDiagnostics(),/restricted/)
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:LOCAL_PUSH_ORIGIN}})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{async getRegistration(){return {active:{scriptURL:LOCAL_PUSH_ORIGIN+'/unrelated-worker.js'}}},async register(){registrations++}}}})
  await assert.rejects(installLocalPushDiagnostics(),/unrelated service worker/)
  assert.equal(registrations,0)
 }finally{
  for(const [key,value] of Object.entries(saved)){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}
 }
})
test('install reports ready only after activation and never requests permission or displays anything',async()=>{
 const saved=Object.fromEntries(['location','navigator','window','Notification'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 let forbidden=0
 const active={state:'activating',scriptURL:LOCAL_PUSH_ORIGIN+'/push-sw.js',postMessage(_data:unknown,ports:MessagePort[]){ports[0].postMessage({version:1,revision:LOCAL_PUSH_REVISION,storageAvailable:true,events:[]})}}
 const registration={active,installing:null,waiting:null,pushManager:{async getSubscription(){return null}},async getNotifications(){return []},async update(){setTimeout(()=>{active.state='activated'},50)}}
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:LOCAL_PUSH_ORIGIN}})
  Object.defineProperty(globalThis,'window',{configurable:true,value:{Notification:{}}})
  Object.defineProperty(globalThis,'Notification',{configurable:true,value:{permission:'granted',requestPermission(){forbidden++}}})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{async getRegistration(){return registration},async register(){return registration}}}})
  const result=await installLocalPushDiagnostics()
  assert.equal(result.worker,'activated');assert.ok(result.receipt);assert.equal(forbidden,0)
 }finally{
  for(const [key,value] of Object.entries(saved)){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}
 }
})
test('local cache failure cannot prevent the notification request and is visible in diagnostics',async()=>{
 const fixture=worker(LOCAL_PUSH_ORIGIN,new Map(),false,true)
 await fixture.dispatch('push')
 assert.equal(fixture.stats().shown,1)
 const receipt=localPushReceipt(await fixture.read())!
 assert.equal(receipt.storageAvailable,false);assert.deepEqual(receipt.events,[])
})
test('stalled diagnostic storage does not delay requesting display and has a bounded event lifetime',async()=>{
 const handlers:Record<string,(event:FixtureEvent)=>void>={};let shown=0,task:Promise<unknown>|undefined
 const self={location:{origin:LOCAL_PUSH_ORIGIN},addEventListener(name:string,handler:typeof handlers[string]){handlers[name]=handler},registration:{async showNotification(){shown++}}}
 runInNewContext(source,{self,URL,Response,crypto:{randomUUID},Date,setTimeout,clearTimeout,caches:{open(){return new Promise(()=>{})}}})
 const started=Date.now()
 handlers.push({waitUntil(value){task=value}})
 assert.equal(shown,1,'Storage must not block the display request')
 await task
 assert.ok(Date.now()-started<2500)
})
test('local receipts are capped and pruned, and DTO drops extra fields and rejects malformed data',async()=>{
 const store=new Map<string,string>()
 store.set('/__arize_local_push_receipts__',JSON.stringify([{at:new Date(Date.now()-90000000).toISOString(),eventId:randomUUID(),stage:'push_received',error:null,private:'never retain'}]))
 const fixture=worker(LOCAL_PUSH_ORIGIN,store)
 for(let i=0;i<24;i++)await fixture.dispatch('push')
 const receipt=localPushReceipt(await fixture.read())!
 assert.equal(receipt.events.length,64)
 const withExtras={...receipt,endpoint:'private',events:receipt.events.map(row=>({...row,payload:'private'}))}
 assert.doesNotMatch(JSON.stringify(localPushReceipt(withExtras)),/private|endpoint|payload/)
 assert.equal(localPushReceipt({...receipt,events:[{...receipt.events[0],error:'https://private.test'}]}),null)
 assert.equal(localPushReceipt({...receipt,revision:'old-worker'}),null)
 assert.equal(localPushReceipt({...receipt,events:[{...receipt.events[0],error:{name:'NotAllowedError',private:'hidden'}}]}),null)
 assert.doesNotMatch([...store.values()].join(''),/private/)
})
