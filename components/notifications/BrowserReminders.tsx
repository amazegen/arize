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
  useEffect(() => {
    if (!browserRemindersEnabled) return
    let active = true
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    void (async () => {
      try {
        const subscription = await currentPush()
        const current = await reminderRequest({ action: 'state', endpointHash: await endpointHash(subscription) }) as ReminderState
        if (!active) return
        setSupported(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
        setConnected(!!subscription)
        setState(current); setTime(current.time); setZone(current.enabled ? current.timezone : localZone); setStatus('')
      } catch { if (active) setStatus('Reminders are temporarily unavailable. You can keep using Arize.') }
    })()
    return () => { active = false }
  }, [])
  async function enable() {
    setBusy(true); setStatus('')
    let created: PushSubscription | null = null
    try {
      const publicKey = process.env.NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY
      if (!publicKey || !/^[A-Za-z0-9_-]{87}$/.test(publicKey)) throw new Error('Reminders are not configured yet.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications are off. You can change this in your browser settings; Arize still works without them.')
      await navigator.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' })
      const registration = await readyWorker()
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(publicKey) })
        created = subscription
      }
      const result = await reminderRequest({ action: 'register', subscription: subscription.toJSON(), time, timezone: zone }) as ReminderState
      setState({ ...result, subscribed: true }); setConnected(true); setStatus('Daily reminder enabled on this browser.')
    } catch (error) {
      if (created) await created.unsubscribe().catch(() => undefined)
      setStatus(error instanceof Error ? error.message : 'Could not enable this reminder.')
    } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true)
    try {
      const result = await reminderRequest({ action: 'schedule', time, timezone: zone }) as ReminderState
      setState({ ...result, subscribed: state?.subscribed ?? false }); setStatus('Time saved for your enabled browsers. The new schedule applies from the next available day.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the time.') }
    finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true)
    try { await stopThisBrowserReminder(); setConnected(false); setState(previous => previous ? { ...previous, subscribed: false } : null); setStatus('Reminders are off on this browser.') }
    catch { setState(previous => previous ? { ...previous, subscribed: false } : null); setStatus('This browser has been unsubscribed if reachable. Server settings could not be confirmed; retry when connected.') }
    finally { setBusy(false) }
  }
  if (!browserRemindersEnabled) return null
  return <section id="profile-reminders" className="adult-panel adult-profile-section reminder-panel" aria-labelledby="reminder-title" aria-busy={busy}>
    <div className="reminder-heading"><Bell size={22} aria-hidden="true" /><h2 id="reminder-title">A moment for you</h2></div>
    <p>One optional daily reminder. No messages, names, goals or check-in scores appear on your lock screen.</p>
    {!supported && <p>Push needs a supported browser on HTTPS. On iPhone or iPad (16.4+), add Arize to your Home Screen, open it there, then enable reminders.</p>}
    {state && !state.eligible && <p>Finish a check-in, complete a goal or have a saved Clarity exchange first. Reminders are always optional.</p>}
    <div className="reminder-fields">
      <label htmlFor="reminder-time">Daily time<input id="reminder-time" type="time" required value={time} onChange={event => setTime(event.target.value)} /></label>
      <label htmlFor="reminder-zone">Time zone<input id="reminder-zone" value={zone} maxLength={80} placeholder="America/New_York" onChange={event => setZone(event.target.value)} aria-describedby="reminder-zone-help" /></label>
    </div>
    <p id="reminder-zone-help" className="reminder-help">Use an IANA time zone, for example America/New_York. This schedule follows daylight saving time; update it when you travel. Delivery may be delayed by your device.</p>
    <div className="reminder-actions">
      {state?.subscribed ? <button className="adult-primary" disabled={busy || !time || !zone} onClick={save}>Save reminder time</button>
        : <button className="adult-primary" disabled={busy || !supported || !state?.eligible || !time || !zone} onClick={enable}>{busy ? 'Updating…' : 'Enable on this browser'}</button>}
      {connected && <button className="adult-secondary" disabled={busy} onClick={disable}><BellOff size={17} aria-hidden="true" /> Turn off on this browser</button>}
    </div>
    <p className="reminder-help">The time is shared by your enabled browsers (up to five). Turning off affects only this browser. Signing out also unsubscribes this browser.</p>
    <p role="status" aria-live="polite">{status || (state?.subscribed ? 'Enabled on this browser.' : 'Off on this browser.')}</p>
  </section>
}
