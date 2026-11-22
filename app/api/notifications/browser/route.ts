import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { boundedJson, pushEnabled, reminderState, reminderTime, reminderZone, samePushOrigin, subscriptionInput } from '@/lib/notifications/policy'
import { pushStore } from '@/lib/notifications/server'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })
  if (process.env.ARIZE_EDITION === 'student') return reply({ error: 'Not found.' }, 404)
  if (!pushEnabled(process.env)) return reply({ error: 'Reminders are not enabled yet.' }, 503)
  if (!samePushOrigin(request, process.env)) return reply({ error: 'Open reminder settings in Arize.' }, 403)
  let input: Record<string, unknown>
  try {
    const body = await boundedJson(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    input = body as Record<string, unknown>
  } catch { return reply({ error: 'Invalid request.' }, 400) }
  const action = input.action
  const allowed: Record<string, string[]> = { state: ['action', 'endpointHash'], disable: ['action', 'endpointHash'], register: ['action', 'subscription', 'time', 'timezone'], schedule: ['action', 'time', 'timezone'] }
  if (typeof action !== 'string' || !Object.hasOwn(allowed, action) || Object.keys(input).some(key => !allowed[action].includes(key))) return reply({ error: 'Invalid request.' }, 400)
  if (input.endpointHash != null && (typeof input.endpointHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.endpointHash))) return reply({ error: 'Invalid request.' }, 400)
  if (action === 'disable' && !input.endpointHash) return reply({ error: 'This browser has no reminder to disable.' }, 400)
  if (['register', 'schedule'].includes(action) && (!reminderTime(input.time) || !reminderZone(input.timezone))) return reply({ error: 'Choose a valid time and time zone.' }, 400)
  const subscription = action === 'register' ? subscriptionInput(input.subscription) : null
  if (action === 'register' && !subscription) return reply({ error: 'This browser’s push service is not supported or the subscription expired.' }, 400)
  try {
    const client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return reply({ error: 'Sign in again to manage reminders.' }, 401)
    const result = await pushStore().call('browser_push_manage', {
      p_user: user.id, p_action: action, p_hash: subscription ? createHash('sha256').update(subscription.endpoint).digest('hex') : input.endpointHash ?? null,
      p_subscription: subscription, p_time: input.time ?? null, p_zone: input.timezone ?? null,
    })
    if (!result || typeof result !== 'object') throw new Error()
    if ('error' in result) return reply({ error: 'Could not save this reminder. Complete an activity first, or turn off the existing reminder on this browser before switching accounts.' }, 409)
    const state = reminderState(result)
    if (!state) throw new Error()
    return reply(state)
  } catch {
    // Never log endpoint capabilities, encryption keys, user IDs or SDK errors.
    return reply({ error: 'Reminders are temporarily unavailable. Your other Arize features still work.' }, 503)
  }
}
