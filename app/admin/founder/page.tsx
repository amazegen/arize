import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import FounderDashboard from '@/components/founder/FounderDashboard'
import { founderDays } from '@/lib/founder/metrics'
import { founderSession, loadFounderMetrics } from '@/lib/founder/server'
export const dynamic = 'force-dynamic'
export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string | string[] }> }) {
  const session = await founderSession()
  if (!session.ok) {
    if (session.status === 404) notFound()
    if (session.status === 401) redirect('/sign-in?next=%2Fadmin%2Ffounder')
    return <main className="adult-theme" style={{ padding: 32, minHeight: '100dvh' }}><h1>Founder overview</h1><p role="alert">{session.error}</p><Link href="/settings">Back to Profile</Link></main>
  }
  const params = await searchParams
  const days = founderDays(params.days)
  const [metrics, consolePermission] = await Promise.all([
    days ? loadFounderMetrics(session, days) : Promise.resolve(null),
    session.supabase.rpc('clarity_console_allowed', { p_edition: 'adult' }).abortSignal(AbortSignal.timeout(8_000)),
  ])
  return <FounderDashboard metrics={metrics} days={days ?? 30} invalidRange={!days} canConfigureClarity={!consolePermission.error && consolePermission.data === true} />
}
