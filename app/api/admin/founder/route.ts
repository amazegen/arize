import { founderDays } from '@/lib/founder/metrics'
import { founderHeaders, founderSession, loadFounderMetrics } from '@/lib/founder/server'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const session = await founderSession()
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: founderHeaders })
  if (!session.ok) return reply({ error: session.error }, session.status)
  const url = new URL(request.url)
  if ([...url.searchParams.keys()].some(k => k !== 'days') || url.searchParams.getAll('days').length > 1) return reply({ error: 'Choose a supported reporting range.' }, 400)
  const days = founderDays(url.searchParams.get('days'))
  if (!days) return reply({ error: 'Choose 7, 30 or 90 days.' }, 400)
  const metrics = await loadFounderMetrics(session, days)
  return metrics ? reply({ metrics, student: { status: 'not_connected' } }) : reply({ error: 'Reporting is temporarily unavailable. No numbers have been substituted.' }, 503)
}
