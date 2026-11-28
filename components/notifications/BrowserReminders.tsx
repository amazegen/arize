'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { browserRemindersEnabled, currentPush, endpointHash, readyWorker, reminderRequest, stopThisBrowserReminder, vapidBytes } from '@/lib/notifications/browser'
import type { ReminderState } from '@/lib/notifications/policy'

export function BrowserReminders() {
  const [state, setState] = useState<ReminderState | null>(null)
  const [time, setTime] = useState('09:00')
  const [zone, setZone] = useState('UTC')
  const [status, setStatus] = useState('Loading reminder settings…')
  const [busy, setBusy] = useState(false)
  const [supported, setSupported] = useState(false)
  const [connected, setConnected] = useState(false)
  const [permission,setPermission]=useState<NotificationPermission|'unsupported'>('unsupported')
  useEffect(() => {
    if (!browserRemindersEnabled) return
    let active = true
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const inspectPermission=()=>{const capable=window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;setSupported(capable);setPermission(capable?Notification.permission:'unsupported')}
    inspectPermission()
    let refreshing=false
    const refresh=async()=>{
      if(refreshing)return;refreshing=true;inspectPermission()
      try {
        const subscription = await currentPush()
        const current = await reminderRequest({ action: 'state', endpointHash: await endpointHash(subscription) }) as ReminderState
        if (!active) return
        setConnected(!!subscription)
        setState(current); setTime(current.time); setZone(current.enabled ? current.timezone : localZone); setStatus('')
      } catch { if (active) setStatus('Reminders are temporarily unavailable. You can keep using Arize.') }
      finally{refreshing=false}
    }
    void refresh();window.addEventListener('focus',refresh)
    return () => { active = false;window.removeEventListener('focus',refresh) }
  }, [])
  async function enable() {
    setBusy(true); setStatus('')
    let created: PushSubscription | null = null
    try {
      const publicKey = process.env.NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY
      const accountGuard=state?.accountGuard
      if(!accountGuard)throw new Error('Reopen reminder settings before enabling this browser.')
      if (!publicKey || !/^[A-Za-z0-9_-]{87}$/.test(publicKey)) throw new Error('Reminders are not configured yet.')
      const chosen = Notification.permission==='default'?await Notification.requestPermission():Notification.permission
      setPermission(chosen)
      if (chosen !== 'granted') throw new Error('Notifications are off. You can change this in your browser settings; Arize still works without them.')
      const registered=await navigator.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' })
      const registration = await readyWorker(registered)
      let subscription = await registration.pushManager.getSubscription()
      if(subscription?.expirationTime!=null&&subscription.expirationTime<=Date.now()){await subscription.unsubscribe();subscription=null}
      if(subscription){const existing=subscription.options.applicationServerKey,expected=vapidBytes(publicKey);if(!existing||new Uint8Array(existing).length!==expected.length||new Uint8Array(existing).some((value,i)=>value!==expected[i]))throw new Error('Reminder keys changed. Turn off this browser reminder, then enable it again.')}
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(publicKey) })
        created = subscription
      }
      const result = await reminderRequest({ action: 'register', subscription: subscription.toJSON(), time, timezone: zone,accountGuard }) as ReminderState
      setState({ ...result, subscribed: true }); setConnected(true); setStatus('Daily reminder enabled on this browser.')
    } catch (error) {
      if (created) await created.unsubscribe().catch(() => undefined)
      setStatus(error instanceof Error ? error.message : 'Could not enable this reminder.')
    } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true)
    try {
      const result = await reminderRequest({ action: 'schedule', time, timezone: zone,accountGuard:state?.accountGuard }) as ReminderState
      setState({ ...result, subscribed: state?.subscribed ?? false }); setStatus('Time saved for your enabled browsers. The new schedule applies from the next available day.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the time.') }
    finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true)
    try { await stopThisBrowserReminder(state?.accountGuard); setConnected(false); setState(previous => previous ? { ...previous, subscribed: false } : null); setStatus('Reminders are off on this browser.') }
    catch { setState(previous => previous ? { ...previous, subscribed: false } : null); setStatus('This browser has been unsubscribed if reachable. Server settings could not be confirmed; retry when connected.') }
    finally { setBusy(false) }
  }
  if (!browserRemindersEnabled) return null
  const enabledHere=!!state?.subscribed&&connected&&permission==='granted'
  const configuredKey=/^[A-Za-z0-9_-]{87}$/.test(process.env.NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY??'')
  return <section id="profile-reminders" className="adult-panel adult-profile-section reminder-panel" aria-labelledby="reminder-title" aria-busy={busy}>
    <div className="reminder-heading"><Bell size={22} aria-hidden="true" /><h2 id="reminder-title">A moment for you</h2></div>
    <p>One optional daily reminder. No messages, names, goals or check-in scores appear on your lock screen.</p>
    {!supported && <p>Push needs a supported browser on HTTPS. On iPhone or iPad (16.4+), add Arize to your Home Screen, open it there, then enable reminders.</p>}
    {!configuredKey&&<p>Reminders are awaiting setup. No notification permission will be requested.</p>}
    {permission==='denied'&&<p>Notifications are blocked in this browser. Change its site settings if you want reminders. Arize works normally without them.</p>}
    {state?.subscribed&&!enabledHere&&permission!=='denied'&&<p>This browser is not currently ready to receive reminders. Enable it again to reconnect.</p>}
    {state && !state.eligible && <p>Finish a check-in, complete a goal or have a saved Clarity exchange first. Reminders are always optional.</p>}
    <div className="reminder-fields">
      <label htmlFor="reminder-time">Daily time<input id="reminder-time" type="time" required value={time} onChange={event => setTime(event.target.value)} /></label>
      <label htmlFor="reminder-zone">Time zone<input id="reminder-zone" value={zone} maxLength={80} placeholder="America/New_York" onChange={event => setZone(event.target.value)} aria-describedby="reminder-zone-help" /></label>
    </div>
    <p id="reminder-zone-help" className="reminder-help">Use an IANA time zone, for example America/New_York. This schedule follows daylight saving time; update it when you travel. Delivery may be delayed by your device.</p>
    <div className="reminder-actions">
      {enabledHere ? <button className="adult-primary" disabled={busy || !time || !zone} onClick={save}>Save reminder time</button>
        : <button className="adult-primary" disabled={busy || !supported || !configuredKey || permission==='denied' || !state?.eligible || !time || !zone} onClick={enable}>{busy ? 'Updating…' : 'Enable on this browser'}</button>}
      {connected && <button className="adult-secondary" disabled={busy} onClick={disable}><BellOff size={17} aria-hidden="true" /> Turn off on this browser</button>}
    </div>
    <p className="reminder-help">The time is shared by your enabled browsers (up to five). Turning off affects only this browser. Signing out also unsubscribes this browser.</p>
    <p role="status" aria-live="polite">{status || (enabledHere ? 'Enabled on this browser.' : 'Off on this browser.')}</p>
  </section>
}
