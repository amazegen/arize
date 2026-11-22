export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { ConsentForm } from '@/components/legal/ConsentForm'
import { hasCurrentLegalConsent, PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/consent'
import { createClient } from '@/lib/supabase/server'

export default async function ConsentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const [{ data: consent }, { data: profile }] = await Promise.all([
    supabase
      .from('legal_consents')
      .select('terms_version, privacy_version')
      .eq('user_id', user.id)
      .eq('terms_version', TERMS_VERSION)
      .eq('privacy_version', PRIVACY_VERSION)
      .maybeSingle(),
    supabase.from('profiles').select('onboarded').eq('id', user.id).maybeSingle(),
  ])

  if (hasCurrentLegalConsent(consent)) {
    redirect(profile?.onboarded ? '/home' : '/onboarding')
  }

  return (
    <main className="adult-theme adult-auth" style={{
      background: "var(--cream)", minHeight: '100dvh', padding: '28px 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <Link href="/" aria-label="Arize home" style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          color: "var(--ink)", textDecoration: 'none', marginBottom: '28px',
          fontFamily: "var(--font-adult)", fontSize: '22px',
        }}>
          <Image src="/flower%20nobg.png" alt="" width={40} height={40} />
          Arize
        </Link>
        <section style={{
          background: "var(--green-soft)", border: "1px solid var(--border)",
          borderRadius: '22px', padding: "clamp(20px, 6vw, 34px)",
          boxShadow: "var(--shadow)",
        }}>
          <ConsentForm />
        </section>
      </div>
    </main>
  )
}
