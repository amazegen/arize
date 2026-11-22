import Link from 'next/link'
import { ArrowLeft, MessageSquareText } from 'lucide-react'

export default function FeedbackPage() {
  return (
    <div style={{ minHeight: '100%', padding: "20px", display: 'flex', flexDirection: 'column' }}>
      <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: "var(--muted)", textDecoration: 'none', fontSize: "16px", alignSelf: 'flex-start' }}>
        <ArrowLeft size={17} /> Back to Profile
      </Link>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '36px 0 72px' }}>
        <div style={{
          width: '100%', maxWidth: '430px', textAlign: 'center',
          padding: '36px 28px', borderRadius: '20px',
          background: "var(--surface)", border: "1px solid var(--yellow)",
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            display: 'grid', placeItems: 'center', margin: '0 auto 20px',
            background: "var(--yellow-soft)",
          }}>
            <MessageSquareText size={26} color="var(--green)" />
          </div>
          <p style={{ fontSize: "14px", color: "var(--green)", fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Your voice matters
          </p>
          <h1 style={{ fontFamily: "var(--font-adult)", fontSize: '28px', color: "var(--ink)", fontWeight: 500, marginBottom: '12px' }}>
            Feedback survey coming soon
          </h1>
          <p style={{ fontSize: "16px", color: "var(--muted)", lineHeight: 1.6 }}>
            We&apos;re preparing a short survey so you can tell us what&apos;s working and what would make Arize more useful.
          </p>
        </div>
      </div>
    </div>
  )
}
