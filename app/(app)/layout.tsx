export const dynamic = 'force-dynamic'

import { BottomNav } from '@/components/nav/BottomNav'
import { WelcomeModal } from '@/components/WelcomeModal'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/nav/AppHeader'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/consent'
import { getUserAccess } from '@/lib/access/server'
import { AccessProvider } from '@/components/access/AccessProvider'
import { EarlyMemberTrialModal } from '@/components/access/EarlyMemberTrialModal'
import { AccountDeletionPanel } from '@/components/billing/AccountDeletionPanel'
import { ReminderNudge } from '@/components/notifications/ReminderNudge'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const { data: deletion } = await supabase.from('account_deletion_jobs').select('id').eq('user_id', user.id).maybeSingle()
  if (deletion) return <div className="adult-theme"><main className="adult-content deletion-pending"><AppHeader /><AccountDeletionPanel pending /></main></div>

  const { data: consent } = await supabase
    .from('legal_consents')
    .select('id')
    .eq('user_id', user.id)
    .eq('terms_version', TERMS_VERSION)
    .eq('privacy_version', PRIVACY_VERSION)
    .maybeSingle()

  if (!consent) redirect('/consent')

  const access = await getUserAccess(supabase, user.id)

  return (
    <div className="adult-theme adult-shell">
      <a className="adult-skip-link" href="#adult-main">Skip to content</a>
        <AccessProvider access={access}>
          <AppHeader initial={String(user.user_metadata?.full_name || user.email || 'A').slice(0, 1).toUpperCase()} />
          {/* Page content */}
          <main id="adult-main" className="adult-main" tabIndex={-1}>
            <div className="adult-content">{children}</div>
          </main>
          <BottomNav />
          <WelcomeModal />
          <EarlyMemberTrialModal />
          <ReminderNudge userId={user.id} />
        </AccessProvider>
    </div>
  )
}
