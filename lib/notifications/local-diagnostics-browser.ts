'use client'

import { LOCAL_PUSH_ORIGIN, localPushReceipt, type LocalPushReceipt } from './local-diagnostics.ts'

export interface LocalPushSnapshot {
  permission: NotificationPermission | 'unsupported'
  worker: string
  subscribed: boolean
  activeNotifications: number | null
  receipt: LocalPushReceipt | null
}
function assertLocal() {
  if(location.origin!==LOCAL_PUSH_ORIGIN)throw new Error('Diagnostics are restricted to the local adult test app.')
}
function readReceipt(worker:ServiceWorker):Promise<LocalPushReceipt|null> {
  return new Promise(resolve=>{
    const channel=new MessageChannel()
    const finish=(value:LocalPushReceipt|null)=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value)}
    const timer=setTimeout(()=>finish(null),2000)
    channel.port1.onmessage=event=>finish(localPushReceipt(event.data))
    channel.port1.onmessageerror=()=>finish(null)
    try{worker.postMessage({type:'ARIZE_LOCAL_PUSH_DIAGNOSTICS_READ',version:1},[channel.port2])}
    catch{finish(null)}
  })
}
export async function inspectLocalPush():Promise<LocalPushSnapshot> {
  assertLocal()
  const permission='Notification'in window?Notification.permission:'unsupported'
  const registration='serviceWorker'in navigator?await navigator.serviceWorker.getRegistration('/'):undefined
  if(!registration||registration.active?.scriptURL!==new URL('/push-sw.js',location.origin).href)
    return {permission,worker:'No active Arize worker',subscribed:false,activeNotifications:null,receipt:null}
  const [subscription,notifications,receipt]=await Promise.all([
    registration.pushManager.getSubscription(),
    registration.getNotifications({tag:'arize-daily-check-in'}).then(values=>values.length).catch(()=>null),
    readReceipt(registration.active),
  ])
  return {permission,worker:registration.active.state,subscribed:!!subscription,activeNotifications:notifications,receipt}
}
export async function installLocalPushDiagnostics() {
  assertLocal()
  if(!('serviceWorker'in navigator))throw new Error('Service workers are unavailable here.')
  const existing=await navigator.serviceWorker.getRegistration('/')
  const expected=new URL('/push-sw.js',location.origin).href
  if(existing&&[existing.active,existing.waiting,existing.installing].some(worker=>worker&&worker.scriptURL!==expected))
    throw new Error('An unrelated service worker owns this scope. Diagnostics will not replace it.')
  // No permission request, subscription change, push event or display command.
  const registration=await navigator.serviceWorker.register('/push-sw.js',{scope:'/',updateViaCache:'none'})
  await registration.update()
  const deadline=Date.now()+8000
  while(Date.now()<deadline){
    const current=await inspectLocalPush()
    if(current.receipt&&current.worker==='activated'&&!registration.installing&&!registration.waiting)return current
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  throw new Error('The diagnostics worker did not become ready. Refresh this page and try again.')
}
