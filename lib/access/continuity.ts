import { createHmac, timingSafeEqual } from 'node:crypto'
import { resolveAccess, type AccessSnapshot } from './entitlements.ts'

export const CONTINUITY_COOKIE = 'arize_membership_continuity'
export const CONTINUITY_SECONDS = 6 * 60 * 60
type ContinuityClaim = { v: 1; user: string; issued: number; expires: number; source: AccessSnapshot['source'] }

export function signContinuity(user: string, access: AccessSnapshot, secret: string, now = Date.now()) {
  if (secret.length < 32 || access.plan !== 'plus' || !access.billingEnabled || access.continuity) return null
  const payload = Buffer.from(JSON.stringify({ v: 1, user, source: access.source, issued: now, expires: now + CONTINUITY_SECONDS * 1000 } satisfies ContinuityClaim)).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

export function verifyContinuity(token: string | undefined, user: string, secret: string, now = Date.now()): AccessSnapshot | null {
  if (!token || token.length > 1000 || secret.length < 32) return null
  const pieces = token.split('.')
  if (pieces.length !== 2) return null
  try {
    const signature = Buffer.from(pieces[1], 'base64url')
    const expected = createHmac('sha256', secret).update(pieces[0]).digest()
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null
    const claim = JSON.parse(Buffer.from(pieces[0], 'base64url').toString()) as ContinuityClaim
    if (claim.v !== 1 || claim.user !== user || !Number.isFinite(claim.issued) || !Number.isFinite(claim.expires)
      || claim.issued > now + 30_000 || claim.expires <= now || claim.expires - claim.issued > CONTINUITY_SECONDS * 1000) return null
    return { ...resolveAccess([], false), billingEnabled: true, source: claim.source, continuity: true, continuityEndsAt: new Date(claim.expires).toISOString() }
  } catch { return null }
}
