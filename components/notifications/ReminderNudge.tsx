'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { browserRemindersEnabled, currentPush, endpointHash, reminderRequest } from '@/lib/notifications/browser'

export function ReminderNudge({ userId }: { userId: string }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const supabase = useMemo(() => browserRemindersEnabled ? createClient() : null, [])
  const key = `arize-reminder-dismissed:${userId}`
  useEffect(() => {
    if (!browserRemindersEnabled) return
    if (!('Notification' in window) || Notification.permission === 'denied' || !('PushManager' in window)) return
    let active = true
    const dismissed = () => { try { return sessionStorage.getItem(key) === 'yes' } catch { return true } }
    if (!dismissed()) void (async () => {
      try {
        const state = await reminderRequest({ action: 'state', endpointHash: await endpointHash(await currentPush()) })
        if (active) setVisible(state.eligible && !state.enabled)
      } catch { /* Optional reminders never block an activity. */ }
    })()
    return () => { active = false }
  }, [pathname, key])
  useEffect(() => {
    const listener = supabase?.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT') void currentPush().then(subscription => subscription?.unsubscribe()).catch(() => undefined)
    })
    return () => listener?.data.subscription.unsubscribe()
  }, [supabase])
  if (!browserRemindersEnabled || !visible || pathname === '/settings') return null
  return <aside className="reminder-nudge" aria-label="Optional reminder">
    <div><strong>Make a little space tomorrow?</strong><p>Choose a daily reminder. Completely optional.</p></div>
    <Link href="/settings#profile-reminders">Choose a time</Link>
    <button type="button" onClick={() => { setVisible(false); try { sessionStorage.setItem(key, 'yes') } catch { /* Session-only dismissal. */ } }}>Not now</button>
  </aside>
}
