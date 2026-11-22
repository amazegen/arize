import { timingSafeEqual } from 'node:crypto'
import { sendNotification } from 'web-push'
import { dispatchPush } from '@/lib/notifications/delivery'
import { pushStore } from '@/lib/notifications/server'
import { pushEnabled } from '@/lib/notifications/policy'

export const runtime = 'nodejs'
export const maxDuration = 120
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (process.env.ARIZE_EDITION === 'student') return new Response(null, { status: 404, headers })
  const secret = process.env.BROWSER_PUSH_DISPATCH_SECRET ?? '', received = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(received), b = Buffer.from(expected)
  if (secret.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) return new Response(null, { status: 401, headers })
  if (!pushEnabled(process.env) || process.env.BROWSER_PUSH_SEND_ENABLED !== 'true') return Response.json({ state: 'disabled' }, { headers })
  try {
    const result = await dispatchPush(pushStore(), process.env, (sub, payload, options) => sendNotification(sub, payload, options))
    return Response.json(result, { headers })
  } catch { return Response.json({ error: 'Reminder dispatch unavailable.' }, { status: 503, headers }) }
}
