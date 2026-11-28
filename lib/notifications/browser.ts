'use client'

export const browserRemindersEnabled = process.env.NEXT_PUBLIC_BROWSER_PUSH_ENABLED === 'true'
export async function reminderRequest(body: Record<string, unknown>) {
  const response = await fetch('/api/notifications/browser', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not update reminders.')
  return result
}
export async function currentPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  if(registration?.active?.scriptURL!==new URL('/push-sw.js',location.origin).href)return null
  const subscription=await registration?.pushManager.getSubscription()??null
  return subscription?.expirationTime!=null&&subscription.expirationTime<=Date.now()?null:subscription
}
export async function endpointHash(subscription: PushSubscription | null) {
  if (!subscription) return null
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint))
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
}
export async function stopThisBrowserReminder(accountGuard?:string) {
  const subscription = await currentPush()
  if (!subscription) return
  const hash = await endpointHash(subscription)
  // Sign-out callers may not have the card's state. Reading a binding never prompts.
  try {
    const guard=accountGuard??(await reminderRequest({action:'state',endpointHash:hash})).accountGuard
    await reminderRequest({ action: 'disable', endpointHash: hash,accountGuard:guard })
  } finally {
    await subscription.unsubscribe()
  }
}
export function vapidBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}
export async function readyWorker(registration:ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
 const worker=registration.active?.state==='activated'?registration.active:registration.installing??registration.waiting??registration.active
 if(!worker||worker.scriptURL!==new URL('/push-sw.js',location.origin).href)throw new Error('Arize reminder worker is unavailable.')
 if(worker.state==='activated')return registration
 await new Promise<void>((resolve,reject)=>{
  const done=(error?:Error)=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);if(error)reject(error);else resolve()}
  const changed=()=>{if(worker.state==='activated')done();else if(worker.state==='redundant')done(new Error('Reminder worker could not activate. Try again.'))}
  const timer=setTimeout(()=>done(new Error('The browser could not activate reminders. Try again later.')),10000)
  worker.addEventListener('statechange',changed);changed()
 })
 return registration
}
