'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { AccessSnapshot } from '@/lib/access/entitlements'

const AccessContext = createContext<AccessSnapshot | null>(null)

export function AccessProvider({
  access,
  children,
}: {
  access: AccessSnapshot
  children: React.ReactNode
}) {
  const [current, setCurrent] = useState({ base: access, snapshot: access })
  useEffect(() => {
    let stopped = false
    let inFlight = false
    const controller = new AbortController()
    async function refresh() {
      if (inFlight || stopped) return
      inFlight = true
      try {
        const response = await fetch('/api/billing/access', { method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) })
        if (response.ok) {
          const result = await response.json()
          if (!stopped && result.access) setCurrent({ base: access, snapshot: result.access })
        }
      } catch { /* Keep the last verified view on a transient network failure. */ }
      finally { inFlight = false }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    // A redirect is not proof of payment. Poll the server's verified grant.
    const returning = new URLSearchParams(window.location.search).get('checkout') === 'success'
    let attempts = 0
    const timer = returning ? setInterval(() => { if (++attempts <= 10) void refresh(); else clearInterval(timer) }, 2000) : undefined
    return () => { stopped = true; controller.abort(); window.removeEventListener('focus', refresh); clearInterval(timer) }
  }, [access])
  const snapshot = current.base === access ? current.snapshot : access
  return <AccessContext.Provider value={snapshot}>
    {(snapshot.continuity || snapshot.temporarilyUnavailable) && <p role="status" className="billing-notice">
      {snapshot.continuity ? 'Billing verification is temporarily unavailable. Your recently verified Plus access is being kept for a limited time. Please try again later.' : 'Membership verification is temporarily unavailable. No payment or membership change has been made. Please try again shortly.'}
    </p>}
    {children}
  </AccessContext.Provider>
}

export function useAccess() {
  const access = useContext(AccessContext)
  if (!access) throw new Error('useAccess must be used inside AccessProvider')
  return access
}
