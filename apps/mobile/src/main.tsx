import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { disableReminder, enableReminder, nativeIOS, readReminder } from './reminders'
import { PRIVACY_URL, TERMS_URL } from '../../../lib/legal/consent'
import './mobile.css'

const steps = [
  { title: 'Notice your space', text: 'Look around at your own pace. Name three things you can see. You do not need to close your eyes.' },
  { title: 'Find one point of support', text: 'If it feels comfortable, notice your feet on the floor or the chair beneath you. You can also focus on a nearby object.' },
  { title: 'Choose one small next step', text: 'What would make the next few minutes a little easier? A sip of water, a stretch or a quick break can be enough.' },
]
function App() {
  const [screen, setScreen] = useState<'home' | 'grounding' | 'settings'>('home')
  const [step, setStep] = useState(0)
  const [complete, setComplete] = useState(false)
  const [time, setTime] = useState('09:00')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    let active = true
    void readReminder().then(value => { if (active) { setTime(value.time); setEnabled(value.enabled) } })
    const listener = nativeIOS() ? LocalNotifications.addListener('localNotificationActionPerformed', () => { setScreen('home'); document.querySelector('h1')?.focus() }) : null
    return () => { active = false; void listener?.then(handle => handle.remove()) }
  }, [])
  useEffect(() => { document.querySelector('h1')?.focus() }, [screen, step, complete])
  async function next() {
    if (nativeIOS()) await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
    if (step < steps.length - 1) setStep(value => value + 1)
    else setComplete(true)
  }
  async function reminder(turnOn: boolean) {
    setBusy(true); setStatus('')
    try {
      if (turnOn) await enableReminder(time); else await disableReminder(time)
      setEnabled(turnOn); setStatus(turnOn ? 'Daily reminder saved on this device.' : 'Device reminder turned off.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not update the device reminder.') }
    finally { setBusy(false) }
  }
  return <div className="mobile-shell">
    <header><button className="brand" onClick={() => setScreen('home')} aria-label="Arize home"><img src="./logo.png" alt="" /><span>Arize</span></button><span className="edition">ADULT EDITION</span></header>
    <div className="foundation-note">iOS foundation · Offline preview<br /><span>No live account or private data connected.</span></div>
    <main id="main">
      {screen === 'home' && <>
        <p className="eyebrow">YOUR SPACE, YOUR PACE</p><h1 tabIndex={-1}>A little room<br />to reset.</h1>
        <p className="intro">Start with one small moment. You do not have to figure everything out right now.</p>
        <section className="feature-card"><span className="sun" aria-hidden="true">☀</span><h2>Come back to now</h2><p>A short grounding exercise that works without a connection. Skip any step that does not feel right.</p><button className="primary" onClick={() => { setStep(0); setComplete(false); setScreen('grounding') }}>Take a moment <span aria-hidden="true">↗</span></button></section>
        <section className="small-card"><div><h2>A gentle reminder</h2><p>Optional. Private. On your schedule.</p></div><button className="text-button" onClick={() => setScreen('settings')}>Set a time <span aria-hidden="true">→</span></button></section>
        <p className="scope-note">This starter tests bundled iOS screens, offline use, haptics and local reminders. Your account, Goals, Clarity and Village are not connected to this native build yet.</p>
      </>}
      {screen === 'grounding' && <>
        <button className="text-button back" onClick={() => setScreen('home')}>← Back home</button>
        <p className="eyebrow">A MOMENT, JUST FOR YOU</p>
        <h1 tabIndex={-1}>{complete ? 'A small pause counts.' : steps[step].title}</h1>
        <p className="intro">{complete ? 'Take what helped and leave the rest. You can come back whenever you need a moment.' : steps[step].text}</p>
        <div className="grounding-orb" aria-hidden="true">✺</div>
        <p className="progress" aria-live="polite">{complete ? 'Exercise complete' : `Step ${step + 1} of ${steps.length}`}</p>
        <button className="primary full" onClick={complete ? () => setScreen('home') : next}>{complete ? 'Back to my space' : step === steps.length - 1 ? 'Finish' : 'Next step'}</button>
        {!complete && <button className="text-button full" onClick={next}>Skip this step</button>}
      </>}
      {screen === 'settings' && <>
        <button className="text-button back" onClick={() => setScreen('home')}>← Back home</button><h1 tabIndex={-1}>Your reminders</h1>
        <p className="intro">One gentle nudge, at a time that works for you. No personal details on your lock screen.</p>
        <section className="settings-card" aria-busy={busy}>
          <label htmlFor="local-time">Daily reminder time</label><input id="local-time" type="time" value={time} onChange={event => setTime(event.target.value)} />
          <p>Your device’s local time. iOS may delay delivery, for example when Focus is on. Update your reminder after changing time zones.</p>
          {!nativeIOS() && <p className="notice">Browser preview: device reminders and haptics are available only in the iOS build. No permission is requested here.</p>}
          <button className="primary full" disabled={busy || !time || !nativeIOS()} onClick={() => reminder(true)}>{enabled ? 'Save reminder time' : 'Enable device reminder'}</button>
          {enabled && <button className="text-button full" disabled={busy} onClick={() => reminder(false)}>Turn off reminder</button>}
          <p role="status" aria-live="polite">{status || (enabled ? 'Enabled on this device.' : 'Reminders are off.')}</p>
        </section>
      </>}
    </main>
    <footer><p>Not an emergency service.</p><p>In immediate danger, call <a href="tel:911">911</a>. In the U.S., call or text <a href="tel:988">988</a> for crisis support.</p><p><a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy policy</a> · <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms of use</a></p></footer>
    <nav aria-label="Main navigation"><button aria-current={screen !== 'settings' ? 'page' : undefined} onClick={() => setScreen('home')}><span aria-hidden="true">⌂</span>My space</button><button aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => setScreen('settings')}><span aria-hidden="true">⚙</span>Settings</button></nav>
  </div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
