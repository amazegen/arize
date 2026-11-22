// Loopback-only UI fixture backed by REAL local PostgreSQL reporting functions.
// Synthetic Auth is NOT a Supabase/Auth acceptance test. No provider requests.
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const socket = process.env.ARIZE_TEST_SOCKET
if (!process.argv.includes('--synthetic-only') || !/^\/private\/tmp\/arize-phase5\.[A-Za-z0-9]+$/.test(socket ?? '')) throw new Error('Explicit synthetic flag and disposable Phase 5 socket required')
const db = 'founder_ui'
const query = sql => execFileSync('/opt/homebrew/bin/psql', ['-XAtq', '-h', socket, '-p', '55451', '-U', 'arize_phase5_test', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
// Refuse an unexpected database or a missing real migration.
if (query("select current_database()||':'||coalesce(to_regprocedure('public.founder_dashboard(integer,boolean)')::text,'missing')") !== 'founder_ui:founder_dashboard(integer,boolean)') throw new Error('Fresh local Founder schema required')
const tokens = new Map(), now = new Date().toISOString()
const accounts = { 'founder@example.test': 'd1000000-0000-4000-8000-000000000001', 'ordinary@example.test': 'd1000000-0000-4000-8000-000000000002' }
const makeUser = email => ({ id: accounts[email], aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: now, confirmed_at: now, created_at: now, updated_at: now, last_sign_in_at: now, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Fictional local reviewer' }, identities: [], is_anonymous: false })
const json = (res, status, value, extra = {}) => {
 res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://127.0.0.1:3169', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,prefer,range,x-supabase-api-version', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(value))
}
createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://127.0.0.1:3168')
  if (req.headers.host !== '127.0.0.1:3168') return json(res, 403, {})
  if (req.method === 'OPTIONS') return json(res, 200, {}, { 'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? 'content-type' })
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return json(res, 413, {}) }
  let body; try { body = raw ? JSON.parse(raw) : {} } catch { return json(res, 400, {}) }
  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
   if (!Object.hasOwn(accounts, body.email) || body.password !== 'founder-fixture-only') return json(res, 400, { msg: 'Use the documented fictional account only' })
   const user = makeUser(body.email), iat = Math.floor(Date.now()/1000)
   const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
   const p = Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, iat, exp: iat+3600, aal: 'aal1', user_metadata: user.user_metadata, app_metadata: user.app_metadata })).toString('base64url')
   const token = `${h}.${p}.${createHmac('sha256','fictional-local-signing-only').update(`${h}.${p}`).digest('base64url')}`
   tokens.set(token, user)
   return json(res, 200, { access_token: token, refresh_token: 'fictional-refresh', token_type: 'bearer', expires_in: 3600, expires_at: iat+3600, user })
  }
  const user = tokens.get(req.headers.authorization?.replace(/^Bearer /,''))
  if (!user) return json(res, 401, { message: 'Synthetic session required' })
  if (url.pathname === '/auth/v1/user') return json(res, 200, user)
  if (url.pathname === '/auth/v1/logout') { tokens.delete(req.headers.authorization.replace(/^Bearer /,'')); return json(res, 200, {}) }
  const rpc = url.pathname.split('/').at(-1)
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
   if (rpc === 'membership_rollout_state') return json(res, 200, { enabled: false, stripeMode: 'test' })
   let expr
   if (rpc === 'founder_dashboard_allowed') expr = 'public.founder_dashboard_allowed()'
   else if (rpc === 'clarity_console_allowed') expr = "public.clarity_console_allowed('adult')"
   else if (rpc === 'founder_dashboard' && [7,30,90].includes(body.p_days) && typeof body.p_livemode === 'boolean') expr = `public.founder_dashboard(${body.p_days},${body.p_livemode})`
   else return json(res, 404, {})
   try {
    const result = query(`begin;set local role authenticated;set local request.jwt.claim.sub='${user.id}';set local request.jwt.claim.aal='aal1';select to_jsonb(${expr});rollback;`)
    return json(res, 200, JSON.parse(result))
   } catch { return json(res, 403, { message: 'Local reporting permission or query rejected' }) }
  }
  if (url.pathname.startsWith('/rest/v1/') && ['GET','HEAD'].includes(req.method)) {
   const table = url.pathname.split('/').at(-1)
   let rows = []
   if (table === 'profiles') rows = [{ id: user.id, name: 'Fictional local reviewer', onboarded: true, streak_count: 0 }]
   if (table === 'legal_consents') rows = [{ user_id: user.id, terms_version: '2.0', privacy_version: '2.0' }]
   return json(res, 200, req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows, { 'Content-Range': `0-${Math.max(0,rows.length-1)}/${rows.length}` })
  }
  return json(res, 404, {})
 } catch { return json(res, 503, { message: 'Local fixture unavailable' }) }
}).listen(3168, '127.0.0.1', () => console.log('Fictional Founder review backend: 127.0.0.1:3168. No live services.'))
