export type NativeEnv = Record<string, string | undefined>
export function nativeEnabled(env: NativeEnv) { return env.ARIZE_EDITION === 'adult' && env.NATIVE_API_ENABLED === 'true' }
export function nativeOrigin(origin: string | null, env: NativeEnv) {
  if (origin === null) return true // Native HTTP clients still require a verified bearer token.
  if (origin === 'null') return false
  return (env.NATIVE_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(s => {
    if (s === 'capacitor://localhost') return true
    try { const url = new URL(s); return url.origin === s && (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname))) } catch { return false }
  }).includes(origin)
}
export function bearer(request: Request) {
  const value = request.headers.get('authorization') ?? ''
  return /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(value) && value.length <= 8192 ? value.slice(7) : null
}
export function nativeHeaders(request: Request, env: NativeEnv) {
  const headers: Record<string,string> = { 'Cache-Control':'private, no-store', Vary:'Origin, Authorization', 'X-Content-Type-Options':'nosniff' }
  const origin = request.headers.get('origin')
  if (origin && nativeOrigin(origin,env)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
export async function nativeBody(request: Request, maximum = 65536): Promise<Record<string,unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new Error('body')
  const reader = request.body?.getReader(); if (!reader) throw new Error('body')
  const chunks: Uint8Array[] = []; let length = 0
  for (;;) { const {done,value} = await reader.read(); if (done) break; length += value.byteLength; if (length > maximum) { await reader.cancel(); throw new Error('body') }; chunks.push(value) }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('body')
  return result
}
export function cursor(value: string | null) {
  if (!value) return null
  try {
    if (value.length > 200) throw new Error()
    const decoded = JSON.parse(Buffer.from(value,'base64url').toString('utf8'))
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(decoded.at) || !Number.isFinite(Date.parse(decoded.at)) || !/^[a-f0-9-]{36}$/i.test(decoded.id)) throw new Error()
    return { at: String(decoded.at), id: String(decoded.id) }
  } catch { throw new Error('cursor') }
}
// coach_messages uses a bigint identity, not a UUID. Keep it as text so IDs
// beyond JavaScript's safe integer range are never rounded in a page cursor.
export function messageCursor(value: string | null) {
  if (!value) return null
  try {
    if (value.length > 200) throw new Error()
    const decoded = JSON.parse(Buffer.from(value,'base64url').toString('utf8'))
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(decoded.at) || !Number.isFinite(Date.parse(decoded.at)) || typeof decoded.id !== 'string' || !/^[1-9]\d{0,18}$/.test(decoded.id) || BigInt(decoded.id)>BigInt('9223372036854775807')) throw new Error()
    return {at:String(decoded.at),id:decoded.id as string}
  } catch {throw new Error('cursor')}
}
