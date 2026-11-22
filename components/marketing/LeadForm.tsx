'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { PRIVACY_URL } from '@/lib/legal/consent'
import styles from './marketing.module.css'

export default function LeadForm({ enabled }: { enabled: boolean }) {
  const [pending,setPending] = useState(false), [error,setError] = useState(''), [success,setSuccess] = useState(false)
  const busy = useRef(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !enabled) return
    const data = new FormData(event.currentTarget)
    busy.current=true;setPending(true);setError('')
    try {
      const response = await fetch('/api/marketing/leads', { method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(15_000), body:JSON.stringify({email:data.get('email'),consent:data.get('consent')==='on',website:data.get('website') ?? ''}) })
      if (response.status===429) { setError('Too many requests. Please try again in an hour.');return }
      if (!response.ok) { setError('We could not save your request. Please try again later.');return }
      setSuccess(true)
    } catch { setError('We could not confirm your request. You can safely try again.') }
    finally { busy.current=false;setPending(false) }
  }
  if (!enabled) return <div className={styles.formNotice}><p>The updates list opens soon. You can still create a free account and explore Arize.</p><Link className="adult-primary" href="/sign-up">Create your account <ArrowRight size={18} aria-hidden="true" /></Link></div>
  if (success) return <div className={styles.success} role="status"><CheckCircle2 size={28} aria-hidden="true" /><h3>Thanks for being here.</h3><p>Your interest has been recorded. AmazeGen may contact you by email about Arize.</p><p>This does not create an app account or start a paid membership.</p></div>
  return <form onSubmit={submit} className={styles.leadForm} aria-busy={pending}>
    <label htmlFor="lead-email">Email address</label>
    <div className={styles.emailRow}><input id="lead-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" disabled={pending} aria-describedby="lead-privacy lead-status" /><button className="adult-primary" disabled={pending} type="submit">{pending?'Saving…':'Keep me in the loop'}{!pending && <ArrowRight size={18} aria-hidden="true" />}</button></div>
    <div className={styles.honeypot} aria-hidden="true"><label htmlFor="lead-website">Leave this field empty</label><input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" maxLength={300} /></div>
    <label className={styles.consent}><input type="checkbox" name="consent" required disabled={pending} /><span>I’m 18 or older and would like AmazeGen to contact me by email about Arize.</span></label>
    <p id="lead-privacy" className={styles.fine}>See the <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a> for how to contact AmazeGen about your information or stop these updates. No account or purchase is required.</p>
    <div id="lead-status" role={error?'alert':'status'} className={styles.formStatus}>{error || (pending?'Saving your request…':'')}</div>
  </form>
}
