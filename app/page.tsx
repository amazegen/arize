import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import MarketingPage from '@/components/marketing/MarketingPage'
import { captureConfigured } from '@/lib/marketing/policy'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title:'Arize by AmazeGen | Make room for you',
  description:'Wellness support built for Black professionals: personal check-ins, intentional goals, community and Clarity, your AI thinking partner. Start with free Core.',
  openGraph:{title:'Arize by AmazeGen',description:'Private support for you, built by people like you.',type:'website'},
  twitter:{card:'summary',title:'Arize by AmazeGen',description:'Make room for you.'},
}
export default function LandingPage() {
  if (process.env.ARIZE_EDITION === 'student') notFound()
  const paidCheckoutEnabled=process.env.STRIPE_EXPECTED_MODE==='live' && process.env.STRIPE_CHECKOUT_ENABLED==='true' && process.env.NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED==='true'
  return <MarketingPage captureEnabled={captureConfigured(process.env)} paidCheckoutEnabled={paidCheckoutEnabled} />
}
