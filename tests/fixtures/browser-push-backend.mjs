// Synthetic Auth / real disposable SQL adapter. Loopback-only, never hosted.
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile), socket = process.env.ARIZE_TEST_SOCKET
if (!process.argv.includes('--synthetic-only') || !/^\/private\/tmp\/arize-phase7\.[A-Za-z0-9]+$/.test(socket ?? '')) throw new Error('Disposable Phase 7 socket and explicit synthetic flag required')
const query = async sql => (await run('/opt/homebrew/bin/psql', ['-XAtq', '-h', socket, '-p', '55471', '-U', 'arize_phase7_test', '-d', 'push_tests_v2', '-v', 'ON_ERROR_STOP=1', '-c', sql], { timeout: 8_000 })).stdout.trim()
if (await query("select current_database()||':'||coalesce(to_regprocedure('public.browser_push_claim(integer)')::text,'missing')") !== 'push_tests_v2:browser_push_claim(integer)') throw new Error('Local notification schema missing')
const accounts = { 'reminder@example.test': 'f3000000-0000-4000-8000-000000000001', 'new@example.test': 'f3000000-0000-4000-8000-000000000002' }
const tokens = new Map(), now = new Date().toISOString()
const quote = value => value == null ? 'null' : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'http://127.0.0.1:3177', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,prefer,range,x-supabase-api-version', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS' }); res.end(JSON.stringify(value)) }
createServer(async (req, res) => {
  try {
    if (req.headers.host !== '127.0.0.1:3176') return json(res, 403, {})
    const url = new URL(req.url, 'http://127.0.0.1:3176')
    if (req.method === 'OPTIONS') return json(res, 200, {})
    let raw = ''; for await (const part of req) { raw += part; if (raw.length > 8192) return json(res, 413, {}) }
    const body = raw ? JSON.parse(raw) : {}
    if (url.pathname === '/auth/v1/token') {
      if (!Object.hasOwn(accounts, body.email) || body.password !== 'reminder-fixture-only') return json(res, 400, { msg: 'Use a fictional local account only' })
      const iat = Math.floor(Date.now()/1000)
      const user = { id: accounts[body.email], aud: 'authenticated', role: 'authenticated', email: body.email, email_confirmed_at: now, confirmed_at: now, created_at: now, updated_at: now, last_sign_in_at: now, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Fictional reminder reviewer' }, identities: [], is_anonymous: false }
      const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), p = Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, iat, exp: iat + 3600, aal: 'aal1', app_metadata: user.app_metadata, user_metadata: user.user_metadata })).toString('base64url')
      const token = `${h}.${p}.${createHmac('sha256', 'fictional-local-only').update(`${h}.${p}`).digest('base64url')}`
      tokens.set(token, user)
      return json(res, 200, { access_token: token, refresh_token: 'fictional-refresh-only', token_type: 'bearer', expires_in: 3600, expires_at: iat + 3600, user })
    }
    const bearer = req.headers.authorization?.replace(/^Bearer /, '')
    const user = tokens.get(bearer)
    if (url.pathname.startsWith('/auth/')) {
      if (!user) return json(res, 401, { message: 'Fictional session required' })
      if (url.pathname === '/auth/v1/user') return json(res, 200, user)
      if (url.pathname === '/auth/v1/logout') { tokens.delete(bearer); return json(res, 200, {}) }
    }
    if (bearer === 'synthetic-push-service' && url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1)
      const signatures = { browser_push_manage: ['p_user','p_action','p_hash','p_subscription','p_time','p_zone'], browser_push_claim: ['p_limit'], browser_push_lease_valid: ['p_id','p_token'], browser_push_finish: ['p_id','p_token','p_result'] }
      if (!Object.hasOwn(signatures, name) || Object.keys(body).some(key => !signatures[name].includes(key))) return json(res, 400, {})
      const value = await query(`begin;set local role service_role;select to_jsonb(public.${name}(${signatures[name].map(key => quote(body[key])).join(',')}));commit;`)
      return json(res, 200, value ? JSON.parse(value) : null)
    }
    if (!user) return json(res, 401, { message: 'Fictional session required' })
    if (url.pathname === '/rest/v1/rpc/membership_rollout_state') return json(res, 200, { enabled: false, stripeMode: 'test' })
    if (['/rest/v1/rpc/clarity_console_allowed', '/rest/v1/rpc/founder_dashboard_allowed'].includes(url.pathname)) return json(res, 200, false)
    if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(req.method)) {
      const table = url.pathname.split('/').at(-1)
      const rows = table === 'profiles' ? [{ id: user.id, name: 'Fictional reminder reviewer', onboarded: true, streak_count: 0 }]
        : table === 'legal_consents' ? [{ id: 1, user_id: user.id, terms_version: '2.0', privacy_version: '2.0' }] : []
      return json(res, 200, req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows)
    }
    return json(res, 404, {})
  } catch { return json(res, 503, { message: 'Local fixture unavailable' }) }
}).listen(3176, '127.0.0.1', () => console.log('Synthetic Auth / real SQL push fixture on 127.0.0.1:3176. No outbound providers.'))
