'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { FOUNDER_RANGES, type FounderDays } from '@/lib/founder/metrics'
import styles from './founder.module.css'

export function FounderControls({ days }: { days: FounderDays }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <div className={styles.controls} aria-busy={pending}>
    <label><span className={styles.srOnly}>Reporting range</span>
      <select value={days} disabled={pending} onChange={e => {
        const next = Number(e.target.value)
        if (FOUNDER_RANGES.includes(next as FounderDays)) startTransition(() => router.push(`/admin/founder?days=${next}`))
      }}>{FOUNDER_RANGES.map(n => <option key={n} value={n}>Last {n} days</option>)}</select>
    </label>
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
    <span role="status" className={styles.refreshStatus}>{pending ? 'Updating counts…' : ''}</span>
  </div>
}

export function FounderSignOut() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return <div><button className={styles.signOut} disabled={pending} onClick={async () => {
    setPending(true); setError('')
    try {
      const result = await createClient().auth.signOut()
      if (result.error) throw new Error('Sign out failed')
      router.push('/sign-in'); router.refresh()
    } catch { setError('Unable to sign out. Please try again.'); setPending(false) }
  }}><LogOut size={17} aria-hidden="true" />{pending ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert">{error}</p>}</div>
}
