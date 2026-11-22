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
  return await registration?.pushManager.getSubscription() ?? null
}
export async function endpointHash(subscription: PushSubscription | null) {
  if (!subscription) return null
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint))
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
}
export async function stopThisBrowserReminder() {
  const subscription = await currentPush()
  if (!subscription) return
  const hash = await endpointHash(subscription)
  try { await reminderRequest({ action: 'disable', endpointHash: hash }) } finally {
    await subscription.unsubscribe()
  }
}
export function vapidBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}
export async function readyWorker(): Promise<ServiceWorkerRegistration> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('The browser could not activate reminders. Try again later.')), 10_000) }),
    ])
  } finally { clearTimeout(timeout) }
}
