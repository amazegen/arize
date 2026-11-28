import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { localPushPageAllowed } from '@/lib/notifications/local-diagnostics'
import { LocalPushDiagnostics } from '@/components/notifications/LocalPushDiagnostics'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Local reminder diagnostics · Arize', robots: { index: false, follow: false } }

export default async function LocalPushDiagnosticsPage() {
  if(!localPushPageAllowed(process.env,(await headers()).get('host')))notFound()
  return <div className="adult-theme"><main className="local-push-diagnostics">
    <a href="/settings#profile-reminders">← Back to reminder settings</a>
    <p className="adult-eyebrow">Local adult test app only</p>
    <h1>Reminder delivery diagnostics</h1>
    <p>Inspect this browser without sending a notification. This page cannot request notification permission or trigger a test.</p>
    <LocalPushDiagnostics />
  </main></div>
}
