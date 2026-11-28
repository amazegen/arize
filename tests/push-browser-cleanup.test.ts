import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {currentPush,stopThisBrowserReminder,readyWorker} from '../lib/notifications/browser.ts'

test('browser cleanup is memory-only, own-worker-only, and unsubscribes even if account binding cannot be read',async()=>{
 const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator'),loc=Object.getOwnPropertyDescriptor(globalThis,'location'),win=Object.getOwnPropertyDescriptor(globalThis,'window'),previous=globalThis.fetch
 let unsubscribed=false
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fictional-local-cleanup',expirationTime:null as number|null,async unsubscribe(){unsubscribed=true;return true}}
 const registration={active:{scriptURL:'http://127.0.0.1:3190/push-sw.js',state:'activated'},pushManager:{async getSubscription(){return subscription}}}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{async getRegistration(){return registration}}}})
 Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'http://127.0.0.1:3190'}})
 Object.defineProperty(globalThis,'window',{configurable:true,value:{PushManager:{}}})
 try{
  assert.equal(await currentPush(),subscription)
  subscription.expirationTime=1;assert.equal(await currentPush(),null);subscription.expirationTime=null
  assert.equal(await readyWorker(registration as unknown as ServiceWorkerRegistration),registration)
  registration.active.scriptURL='http://127.0.0.1:3190/unrelated-sw.js';assert.equal(await currentPush(),null)
  await assert.rejects(readyWorker(registration as unknown as ServiceWorkerRegistration));assert.equal(unsubscribed,false)
  registration.active.scriptURL='http://127.0.0.1:3190/push-sw.js'
  globalThis.fetch=async()=>{throw new Error('Fictional local outage')}
  await assert.rejects(stopThisBrowserReminder());assert.equal(unsubscribed,true)
 }finally{
  if(nav)Object.defineProperty(globalThis,'navigator',nav);else Reflect.deleteProperty(globalThis,'navigator')
  if(loc)Object.defineProperty(globalThis,'location',loc);else Reflect.deleteProperty(globalThis,'location')
  if(win)Object.defineProperty(globalThis,'window',win);else Reflect.deleteProperty(globalThis,'window')
  globalThis.fetch=previous
 }
})
test('permission requests remain user-action-only and missing configuration keeps Enable disabled',()=>{
 const ui=readFileSync(new URL('../components/notifications/BrowserReminders.tsx',import.meta.url),'utf8')
 assert.match(ui,/Notification\.permission==='default'\?await Notification\.requestPermission\(\)/)
 const effect=ui.slice(ui.indexOf('useEffect(()'),ui.indexOf('async function enable'))
 assert.doesNotMatch(effect,/requestPermission|pushManager\.subscribe|serviceWorker\.register/)
 assert.match(ui,/!configuredKey/);assert.match(ui,/const accountGuard=state\?\.accountGuard/)
 assert.doesNotMatch(ui,/localStorage|sessionStorage|console\.(log|error)/)
})
