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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const { data: deletion } = await supabase.from('account_deletion_jobs').select('id').eq('user_id', user.id).maybeSingle()
  if (deletion) return <main className="app-container deletion-pending"><AppHeader /><AccountDeletionPanel pending /></main>

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
    <div style={{ background: '#0A1409', minHeight: '100dvh' }}>
      <div className="app-container">
        <AccessProvider access={access}>
          <AppHeader />
          {/* Page content */}
          <main style={{ paddingBottom: '88px', minHeight: 'calc(100dvh - 58px)' }}>
            {children}
          </main>
          <BottomNav />
          <WelcomeModal />
          <EarlyMemberTrialModal />
        </AccessProvider>
      </div>
    </div>
  )
}
