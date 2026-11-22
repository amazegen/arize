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
        <li key={feature} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', color: "var(--ink)", fontSize: "16px", lineHeight: 1.45 }}>
          <Check size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: '2px' }} />
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
    <div style={{ background: "var(--cream)", minHeight: '100%', padding: '18px 20px 32px' }}>
      <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: "var(--muted)", textDecoration: 'none', fontSize: "16px", marginBottom: '18px' }}>
        <ArrowLeft size={17} /> Back to Profile
      </Link>

      <div style={{ textAlign: 'center', maxWidth: '480px', margin: "0 auto 20px" }}>
        <div style={{ width: '52px', height: '52px', display: 'grid', placeItems: 'center', margin: '0 auto 14px', borderRadius: '16px', background: "var(--yellow-soft)", color: "var(--green)" }}>
          <Sparkles size={25} />
        </div>
        <p style={{ color: "var(--green)", fontSize: "13px", fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '8px' }}>Arize memberships</p>
        <h1 style={{ fontFamily: "var(--font-adult)", fontSize: '29px', lineHeight: 1.2, color: "var(--ink)", fontWeight: 500, marginBottom: '10px' }}>Choose the support that fits you</h1>
        <p style={{ color: "var(--muted)", fontSize: "16px", lineHeight: 1.6 }}>
          Keep the essentials free with Core, or unlock the complete Arize experience with Plus.
        </p>
      </div>

      {!access.billingEnabled && (
        <div style={{ maxWidth: '620px', margin: '0 auto 16px', padding: '13px 15px', borderRadius: '12px', background: "var(--green-soft)", border: "1px solid var(--border)", color: "var(--green)", fontSize: "16px", lineHeight: 1.5, textAlign: 'center' }}>
          Membership checkout is coming soon. Everyone keeps full app access during this launch period.
        </div>
      )}

      <div style={{ maxWidth: '620px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '14px' }}>
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: '20px', padding: '21px' }}>
          <p style={{ color: "var(--green)", fontSize: "14px", textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '6px' }}>Core</p>
          <p style={{ color: "var(--ink)", fontFamily: "var(--font-adult)", fontSize: '27px', marginBottom: '3px' }}>Free</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: '18px' }}>Your everyday wellness essentials</p>
          <FeatureList features={CORE_FEATURES} />
        </section>

        <section style={{ background: "var(--yellow-soft)", border: "1px solid var(--yellow)", borderRadius: '20px', padding: '21px', boxShadow: "var(--shadow)" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <p style={{ color: "var(--green)", fontSize: "14px", textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Plus</p>
            <span style={{ fontSize: "13px", color: "var(--ink)", background: "var(--orange)", borderRadius: '100px', padding: '4px 8px', fontWeight: 700 }}>Full access</span>
          </div>
          <p style={{ color: "var(--ink)", fontFamily: "var(--font-adult)", fontSize: '27px', marginBottom: '3px' }}>
            ${MEMBERSHIP_PRICING.monthlyUsd.toFixed(2)} <span style={{ color: "var(--muted)", fontFamily: "var(--font-adult)", fontSize: "14px" }}>/ month</span>
          </p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: '5px' }}>
            or ${MEMBERSHIP_PRICING.annualUsd.toFixed(2)}/year · save {annualSavings}%
          </p>
          <p style={{ color: "var(--green)", fontSize: "14px", marginBottom: '18px' }}>
            {MEMBERSHIP_PRICING.newMemberTrialDays}-day trial for eligible new members · card required
          </p>
          <FeatureList features={PLUS_FEATURES} />
          <BillingActions />
        </section>
      </div>

      <p style={{ maxWidth: '560px', margin: '18px auto 0', color: 'var(--muted)', fontSize: "14px", lineHeight: 1.5, textAlign: 'center' }}>
        Clarity usage is capped on both plans. Trials automatically become a paid, renewing membership unless canceled before the trial ends. Cancel anytime in Manage membership.
      </p>
      <p style={{ maxWidth: '560px', margin: '8px auto 0', color: 'var(--muted)', fontSize: "14px", lineHeight: 1.5, textAlign: 'center' }}>
        By starting a trial, you agree to the{' '}
        <a href="https://amazegen.com/terms.html" target="_blank" rel="noreferrer" style={{ color: "var(--muted)" }}>Terms of Use</a>
        {' '}and{' '}
        <a href="https://amazegen.com/privacy.html" target="_blank" rel="noreferrer" style={{ color: "var(--muted)" }}>Privacy Policy</a>.
      </p>
    </div>
  )
}
