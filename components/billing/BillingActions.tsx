'use client'

import { useRef, useState } from 'react'
import { ArrowUpRight, CreditCard, LoaderCircle, LockKeyhole } from 'lucide-react'
import { useAccess } from '@/components/access/AccessProvider'
import { validBillingUrl, type BillingPeriod } from '@/lib/billing/policy'

type PendingAction = BillingPeriod | 'portal' | null

export function BillingActions() {
  const access = useAccess()
  const [pending, setPending] = useState<PendingAction>(null)
  const [message, setMessage] = useState<string | null>(null)
  const keys = useRef<Partial<Record<BillingPeriod, string>>>({})
  const busy = useRef(false)
  const checkoutEnabled = process.env.NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED === 'true'
  const hasSubscription = access.source === 'checkout_trial' || access.source === 'subscription'

  async function openBilling(path: 'checkout' | 'portal', period?: BillingPeriod) {
    if (busy.current) return
    busy.current = true
    setPending(period ?? 'portal')
    setMessage(null)

    try {
      const response = await fetch(`/api/billing/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(path === 'checkout' && period ? { 'X-Idempotency-Key': keys.current[period] ??= crypto.randomUUID() } : {}),
        },
        body: path === 'checkout' ? JSON.stringify({ period }) : undefined,
        signal: AbortSignal.timeout(20_000),
      })
      const result = await response.json() as { url?: string; error?: string }
      if (!response.ok || !validBillingUrl(result.url, path)) throw new Error(result.error ?? 'Unable to open secure billing. Please try again.')
      window.location.assign(result.url!)
    } catch (error) {
      setPending(null)
      setMessage(error instanceof Error ? error.message : 'Unable to open Stripe. Please try again.')
      busy.current = false
    }
  }

  if (!checkoutEnabled && !hasSubscription) {
    return (
      <div><button disabled style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', border: 0, borderRadius: '12px', padding: '13px', marginTop: '20px', background: 'rgba(201,162,39,0.28)', color: '#D8C57D', fontFamily: 'var(--font-dm-sans)', fontWeight: 700, cursor: 'not-allowed' }}>
        <LockKeyhole size={15} /> Secure checkout setup in progress
      </button><button className="billing-secondary" onClick={() => openBilling('portal')} disabled={pending !== null}>Existing member? Manage billing</button>{message && <p role="alert">{message}</p>}</div>
    )
  }

  return (
    <div style={{ marginTop: '20px' }}>
      {message && (
        <p role="status" style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.25)', borderRadius: '10px', color: '#E8D99B', fontSize: '12px', lineHeight: 1.45, marginBottom: '10px', padding: '10px' }}>
          {message}
        </p>
      )}

      {hasSubscription ? (
        <button onClick={() => openBilling('portal')} disabled={pending !== null} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', border: 0, borderRadius: '12px', padding: '13px', background: '#C9A227', color: '#0E1C12', fontFamily: 'var(--font-dm-sans)', fontWeight: 700, cursor: pending ? 'wait' : 'pointer' }}>
          {pending === 'portal' ? <LoaderCircle className="billing-spinner" size={16} /> : <CreditCard size={16} />}
          Manage membership
        </button>
      ) : (
        <div style={{ display: 'grid', gap: '9px' }}>
          <button onClick={() => openBilling('checkout', 'monthly')} disabled={pending !== null} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', border: 0, borderRadius: '12px', padding: '13px', background: '#C9A227', color: '#0E1C12', fontFamily: 'var(--font-dm-sans)', fontWeight: 700, cursor: pending ? 'wait' : 'pointer' }}>
            {pending === 'monthly' ? <LoaderCircle className="billing-spinner" size={16} /> : <ArrowUpRight size={16} />}
            Continue with monthly
          </button>
          <button onClick={() => openBilling('checkout', 'annual')} disabled={pending !== null} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', border: '1px solid rgba(201,162,39,0.55)', borderRadius: '12px', padding: '12px', background: 'transparent', color: '#F2D98A', fontFamily: 'var(--font-dm-sans)', fontWeight: 700, cursor: pending ? 'wait' : 'pointer' }}>
            {pending === 'annual' ? <LoaderCircle className="billing-spinner" size={16} /> : <ArrowUpRight size={16} />}
            Continue with annual
          </button>
        </div>
      )}

      {!hasSubscription && (
        <button onClick={() => openBilling('portal')} disabled={pending !== null} style={{ width: '100%', border: 0, background: 'transparent', color: '#AFA997', fontFamily: 'var(--font-dm-sans)', fontSize: '11px', marginTop: '10px', cursor: pending ? 'wait' : 'pointer' }}>
          Already subscribed? Manage billing
        </button>
      )}
      {!hasSubscription && <p className="billing-fineprint">New billing customers get a 7-day trial with a card required. Returning customers are charged the price shown at checkout; a new trial is not guaranteed. Cancel in Manage membership before the trial ends to avoid the first charge.</p>}
    </div>
  )
}
