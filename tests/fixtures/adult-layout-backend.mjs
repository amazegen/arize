// Synthetic layout fixture, NOT a Supabase replacement or security test.
// No production imports, external requests, files, credentials or persistence.
// Start explicitly, then point a LOCAL Next build at http://127.0.0.1:3148.
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'

if (!process.argv.includes('--synthetic-only')) throw new Error('Pass --synthetic-only; never use real accounts with this fixture')
const id = '0d6e5bed-2a98-4c8a-a588-6c835370513a'
const roomId = '10000000-0000-4000-8000-000000000001'
const conversationId = '20000000-0000-4000-8000-000000000001'
const now = new Date().toISOString()
const today = now.slice(0, 10)
const week = new Date(); week.setUTCDate(week.getUTCDate() - week.getUTCDay())
const profile = { id, name: 'Layout Tester', username: 'layout_tester', company: 'Synthetic Company', role: 'Layout testing only', onboarded: true, streak_count: 2, last_checkin_date: today }
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'layout@example.test', email_confirmed_at: now,
  confirmed_at: now, created_at: now, updated_at: now, last_sign_in_at: now,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: profile.name }, identities: [], is_anonymous: false }
const tables = {
  profiles: [profile], legal_consents: process.argv.includes('--without-consent') ? [] : [{ id: 'fixture-consent', user_id: id, terms_version: '2.0', privacy_version: '2.0' }],
  account_deletion_jobs: [], access_grants: [], billing_customers: [],
  goals: [{ id: '30000000-0000-4000-8000-000000000001', user_id: id, title: 'Layout fixture goal with a longer title that should wrap cleanly', category: 'Personal', progress: 0, is_complete: false, deadline: today, week_of: week.toISOString().slice(0, 10), notes: 'Synthetic layout note only.', created_at: now }],
  check_ins: [{ id: 'fixture-checkin', user_id: id, mood: 'steady', mood_score: 3, energy: 5, emotion_tags: ['Layout fixture'], journal_text: 'Synthetic layout sample only.', time_of_day: 'morning', created_at: now }],
  village_rooms: [{ id: roomId, name: 'Wins Only', description: 'Synthetic room for local layout review only.', is_featured: false, created_at: now }],
  village_memberships: [{ user_id: id, room_id: roomId, is_moderator: false }],
  village_messages: [{ id: 'fixture-message', user_id: id, room_id: roomId, content: 'Synthetic layout message: ' + 'long-layout-fixture-'.repeat(12), message_type: 'text', profiles: profile, created_at: now }],
  coach_conversations: [{ id: conversationId, user_id: id, title: 'Synthetic saved conversation for responsive layout review', created_at: now, updated_at: now }],
  coach_messages: [{ id: 1, conversation_id: conversationId, user_id: id, role: 'assistant', content: 'This is a synthetic saved message for layout review only.', created_at: now }],
  friday_reflections: [],
}
const json = (res, status, value, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://127.0.0.1:3149',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,prefer,range,x-supabase-api-version',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS', 'Cache-Control': 'no-store', ...extra })
  res.end(JSON.stringify(value))
}
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3148')
  if (req.headers.host !== '127.0.0.1:3148') return json(res, 403, { error: 'Loopback fixture only' })
  if (req.method === 'OPTIONS') return json(res, 200, {}, {
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? 'content-type',
  })
  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(res, 413, {}) }
    let value; try { value = JSON.parse(body) } catch { return json(res, 400, {}) }
    if (!value || typeof value !== 'object' || value.email !== 'layout@example.test' || value.password !== 'layout-fixture-only') return json(res, 400, { msg: 'Only the documented fictional layout account is accepted' })
    const issued = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', email: user.email, iat: issued, exp: issued + 3600, aal: 'aal1', session_id: 'fixture-session', user_metadata: user.user_metadata, app_metadata: user.app_metadata })).toString('base64url')
    const token = `${header}.${payload}.${createHmac('sha256', 'synthetic-layout-not-a-real-secret').update(`${header}.${payload}`).digest('base64url')}`
    return json(res, 200, { access_token: token, refresh_token: 'synthetic-layout-refresh', token_type: 'bearer', expires_in: 3600, expires_at: issued + 3600, user })
  }
  if (url.pathname === '/auth/v1/user') return json(res, 200, user)
  if (url.pathname === '/auth/v1/logout' && req.method === 'POST') return json(res, 200, {})
  if (url.pathname === '/rest/v1/rpc/membership_rollout_state') return json(res, 200, { enabled: false, stripeMode: 'test' })
  if (url.pathname === '/rest/v1/rpc/get_village_moderator_ids') return json(res, 200, [])
  if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(req.method)) {
    let rows = tables[url.pathname.split('/').at(-1)]
    if (!rows) return json(res, 404, { error: 'Unknown synthetic fixture table' })
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3))
    }
    if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')))
    return json(res, 200, req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'Access-Control-Expose-Headers': 'Content-Range' })
  }
  return json(res, 404, { error: 'Fixture is read-only; no provider, media, realtime or mutation support' })
}).listen(3148, '127.0.0.1', () => console.log('Synthetic layout backend on 127.0.0.1:3148. Never use real accounts.'))
