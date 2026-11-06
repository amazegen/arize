'use client'

import Link from 'next/link'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import { useAccess } from '@/components/access/AccessProvider'
import { BillingActions } from '@/components/billing/BillingActions'
import { MEMBERSHIP_PRICING } from '@/lib/access/entitlements'

const CORE_FEATURES = [
  'Daily Reflect check-ins',
  '7 days of Reflect and Pattern history',
  'Up to 3 active goals',
  '20 Clarity messages per month (up to 5/day)',
  '3 recent Clarity conversations',
  'Wins Only Village room with text chat',
]

const PLUS_FEATURES = [
  'Full Reflect and goal history',
  'Unlimited active goals',
  '7, 30, 90-day, and all-time Pattern Map views',
  '300 Clarity messages per month (up to 30/day)',
  'Full Clarity conversation history',
  'Every Village room with text, voice, and video',
  'Reports and exports as they are released',
]

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: 0, padding: 0, listStyle: 'none' }}>
      {features.map(feature => (
        <li key={feature} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', color: '#D8D0C1', fontSize: '13px', lineHeight: 1.45 }}>
          <Check size={16} color="#6B9E7A" style={{ flexShrink: 0, marginTop: '2px' }} />
          {feature}
        </li>
      ))}
    </ul>
  )
}

export default function UpgradePage() {
  const access = useAccess()
  const annualSavings = Math.round(
    (1 - MEMBERSHIP_PRICING.annualUsd / (MEMBERSHIP_PRICING.monthlyUsd * 12)) * 100,
  )

  return (
    <div style={{ background: '#0E1C12', minHeight: '100%', padding: '18px 20px 32px' }}>
      <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#BDB5A0', textDecoration: 'none', fontSize: '13px', marginBottom: '18px' }}>
        <ArrowLeft size={17} /> Back to Profile
      </Link>

      <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto 24px' }}>
        <div style={{ width: '52px', height: '52px', display: 'grid', placeItems: 'center', margin: '0 auto 14px', borderRadius: '16px', background: 'rgba(201,162,39,0.14)', color: '#F2D98A' }}>
          <Sparkles size={25} />
        </div>
        <p style={{ color: '#C9A227', fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '8px' }}>Arize memberships</p>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontSize: '29px', lineHeight: 1.2, color: '#F5F0E8', fontWeight: 500, marginBottom: '10px' }}>Choose the support that fits you</h1>
        <p style={{ color: '#BDB5A0', fontSize: '13px', lineHeight: 1.6 }}>
          Keep the essentials free with Core, or unlock the complete Arize experience with Plus.
        </p>
      </div>

      {!access.billingEnabled && (
        <div style={{ maxWidth: '620px', margin: '0 auto 16px', padding: '13px 15px', borderRadius: '12px', background: 'rgba(123,173,196,0.1)', border: '1px solid rgba(123,173,196,0.25)', color: '#B9D4DF', fontSize: '13px', lineHeight: 1.5, textAlign: 'center' }}>
          Membership checkout is coming soon. Everyone keeps full app access during this launch period.
        </div>
      )}

      <div style={{ maxWidth: '620px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '14px' }}>
        <section style={{ background: '#1A2E1E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '21px' }}>
          <p style={{ color: '#A8C4AF', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '6px' }}>Core</p>
          <p style={{ color: '#F5F0E8', fontFamily: 'var(--font-playfair)', fontSize: '27px', marginBottom: '3px' }}>Free</p>
          <p style={{ color: '#BDB5A0', fontSize: '12px', marginBottom: '18px' }}>Your everyday wellness essentials</p>
          <FeatureList features={CORE_FEATURES} />
        </section>

        <section style={{ background: 'linear-gradient(180deg, #243D28 0%, #172A1B 100%)', border: '1px solid rgba(201,162,39,0.45)', borderRadius: '20px', padding: '21px', boxShadow: '0 12px 36px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <p style={{ color: '#F2D98A', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Plus</p>
            <span style={{ fontSize: '10px', color: '#0E1C12', background: '#C9A227', borderRadius: '100px', padding: '4px 8px', fontWeight: 700 }}>Full access</span>
          </div>
          <p style={{ color: '#F5F0E8', fontFamily: 'var(--font-playfair)', fontSize: '27px', marginBottom: '3px' }}>
            ${MEMBERSHIP_PRICING.monthlyUsd.toFixed(2)} <span style={{ color: '#BDB5A0', fontFamily: 'var(--font-dm-sans)', fontSize: '12px' }}>/ month</span>
          </p>
          <p style={{ color: '#BDB5A0', fontSize: '12px', marginBottom: '5px' }}>
            or ${MEMBERSHIP_PRICING.annualUsd.toFixed(2)}/year · save {annualSavings}%
          </p>
          <p style={{ color: '#F2D98A', fontSize: '11px', marginBottom: '18px' }}>
            {MEMBERSHIP_PRICING.newMemberTrialDays}-day trial for eligible new members · card required
          </p>
          <FeatureList features={PLUS_FEATURES} />
          <BillingActions />
        </section>
      </div>

      <p style={{ maxWidth: '560px', margin: '18px auto 0', color: '#8F897A', fontSize: '11px', lineHeight: 1.5, textAlign: 'center' }}>
        Clarity usage is capped on both plans. Trials automatically become a paid, renewing membership unless canceled before the trial ends. Cancel anytime in Manage membership.
      </p>
      <p style={{ maxWidth: '560px', margin: '8px auto 0', color: '#8F897A', fontSize: '11px', lineHeight: 1.5, textAlign: 'center' }}>
        By starting a trial, you agree to the{' '}
        <a href="https://amazegen.com/terms.html" target="_blank" rel="noreferrer" style={{ color: '#BDB5A0' }}>Terms of Use</a>
        {' '}and{' '}
        <a href="https://amazegen.com/privacy.html" target="_blank" rel="noreferrer" style={{ color: '#BDB5A0' }}>Privacy Policy</a>.
      </p>
    </div>
  )
}
