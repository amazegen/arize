'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, X } from 'lucide-react'
import { useAccess } from './AccessProvider'

export function EarlyMemberTrialModal() {
  const access = useAccess()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (access.source !== 'early_member_trial' || !access.trialEndsAt) return
    try {
      const key = `arize_early_trial_seen_${access.trialEndsAt}`
      if (!localStorage.getItem(key)) queueMicrotask(() => setVisible(true))
    } catch {}
  }, [access.source, access.trialEndsAt])

  function dismiss() {
    if (access.trialEndsAt) {
      try { localStorage.setItem(`arize_early_trial_seen_${access.trialEndsAt}`, '1') } catch {}
    }
    setVisible(false)
  }

  if (!visible || !access.trialEndsAt) return null

  const endDate = new Date(access.trialEndsAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(10,20,9,0.9)', display: 'grid', placeItems: 'center', padding: "20px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="early-trial-title" style={{ width: '100%', maxWidth: '420px', background: "var(--green-soft)", border: "1px solid var(--yellow)", borderRadius: '22px', padding: '26px', position: 'relative' }}>
        <button onClick={dismiss} aria-label="Close" style={{ position: 'absolute', top: '14px', right: '14px', background: 'transparent', border: 0, color: "var(--muted)", cursor: 'pointer', padding: '6px' }}>
          <X size={20} />
        </button>
        <div style={{ width: '48px', height: '48px', display: 'grid', placeItems: 'center', borderRadius: '14px', background: "var(--yellow-soft)", color: "var(--green)", marginBottom: '18px' }}>
          <Gift size={24} />
        </div>
        <p style={{ color: "var(--green)", fontSize: "14px", fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>A thank-you for joining early</p>
        <h2 id="early-trial-title" style={{ fontFamily: "var(--font-adult)", color: "var(--ink)", fontSize: '25px', fontWeight: 500, marginBottom: '12px' }}>Your complimentary Plus access is active</h2>
        <p style={{ color: "var(--muted)", fontSize: "16px", lineHeight: 1.65, marginBottom: '10px' }}>
          Arize is introducing Core and Plus memberships. As an early member, you have full Plus access through {endDate}.
        </p>
        <p style={{ color: "var(--muted)", fontSize: "16px", lineHeight: 1.65, marginBottom: '22px' }}>
          You will not be charged automatically. When this access ends, you can choose Plus or continue with Core for free.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={dismiss} style={{ flex: 1, border: "1px solid var(--border)", background: 'transparent', color: "var(--ink)", borderRadius: '12px', padding: '13px', cursor: 'pointer', fontFamily: "var(--font-adult)", fontWeight: 600 }}>Continue</button>
          <Link href="/upgrade" onClick={dismiss} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', background: "var(--orange)", color: "var(--ink)", borderRadius: '12px', padding: '13px', fontWeight: 700 }}>See plans</Link>
        </div>
      </div>
    </div>
  )
}
