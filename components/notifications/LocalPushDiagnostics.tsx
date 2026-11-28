'use client'

import { useEffect, useState } from 'react'
import { inspectLocalPush, installLocalPushDiagnostics, type LocalPushSnapshot } from '@/lib/notifications/local-diagnostics-browser'

export function LocalPushDiagnostics() {
  const [snapshot,setSnapshot]=useState<LocalPushSnapshot|null>(null)
  const [busy,setBusy]=useState(false)
  const [status,setStatus]=useState('Reading local diagnostics…')
  useEffect(()=>{
    let active=true
    inspectLocalPush().then(value=>{if(active){setSnapshot(value);setStatus('Local status loaded. No notification sent.')}})
      .catch(()=>{if(active)setStatus('Could not read local diagnostics. No notification sent.')})
    return ()=>{active=false}
  },[])
  async function refresh(install=false){
    setBusy(true)
    try{setSnapshot(await(install?installLocalPushDiagnostics():inspectLocalPush()));setStatus(install?'Diagnostics worker ready. No notification sent.':'Local status refreshed. No notification sent.')}
    catch{setStatus('Diagnostics are unavailable or the worker is still updating. Refresh and try again. No notification sent.')}
    finally{setBusy(false)}
  }
  const events=snapshot?.receipt?.events??[]
  const stages=[['push_received','Push received'],['display_requested','Display requested'],['display_resolved','Browser accepted display'],['display_failed','Display failed']] as const
  return <>
    <section className="adult-panel" aria-label="Local browser status" aria-busy={busy}>
      <h2>This Chrome browser</h2>
      <dl className="local-push-status">
        <div><dt>Site notification permission</dt><dd>{snapshot?.permission??'Checking…'}</dd></div>
        <div><dt>Arize worker</dt><dd>{snapshot?.worker??'Checking…'}</dd></div>
        <div><dt>Device subscription</dt><dd>{snapshot?snapshot.subscribed?'Connected':'Not connected':'Checking…'}</dd></div>
        <div><dt>Browser-recorded active reminders</dt><dd>{snapshot?snapshot.activeNotifications??'Unavailable':'Checking…'}</dd></div>
        <div><dt>Diagnostics revision</dt><dd>{snapshot?.receipt?.revision??'Not installed / not responding'}</dd></div>
        <div><dt>Local receipt storage</dt><dd>{snapshot?.receipt?snapshot.receipt.storageAvailable?'Available':'Unavailable':'Not checked'}</dd></div>
      </dl>
      <div className="local-push-actions">
        <button className="adult-primary" disabled={busy} onClick={()=>void refresh(true)}>Install / update diagnostics</button>
        <button className="adult-secondary" disabled={busy} onClick={()=>void refresh()}>Refresh diagnostics</button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
    </section>
    <section className="adult-panel" aria-label="Delivery checkpoints">
      <h2>Delivery checkpoints</h2>
      <dl className="local-push-status">{stages.map(([stage,label])=>{
        const last=events.filter(row=>row.stage===stage).at(-1)
        return <div key={stage}><dt>{label}</dt><dd>{last?new Date(last.at).toLocaleString():'Not observed since diagnostics were installed'}</dd></div>
      })}</dl>
      <p>A resolved display request means Chrome accepted showNotification—not proof that macOS showed a banner. Focus, OS settings and delivery can still affect it.</p>
      <p>These receipts cannot reconstruct the two earlier tests. An empty history does not prove those pushes were never received.</p>
    </section>
    <section className="adult-panel" aria-label="Local event history">
      <h2>Local event history</h2>
      <p>Only fixed event/error labels, random event references and timestamps. Last 64 events from the past 24 hours; stored only in this browser. No account IDs, payloads, endpoints, keys, chat content, analytics or server uploads.</p>
      {events.length?<ol className="local-push-events">{events.map((event,index)=><li key={`${event.eventId}-${event.stage}-${index}`}><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><strong>{event.stage.replaceAll('_',' ')}</strong>{event.error&&<span>Error: {event.error}</span>}<small>Event {event.eventId.slice(0,8)}</small></li>)}</ol>:<p>No local events recorded yet.</p>}
      <p>Nothing on this page sends notifications or changes Focus. Another real test requires separate approval.</p>
    </section>
  </>
}
