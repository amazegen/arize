import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access/server'
import { CONTINUITY_COOKIE, CONTINUITY_SECONDS, signContinuity } from '@/lib/access/continuity'
import { NO_STORE, sameOrigin } from '@/lib/billing/policy'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers: NO_STORE })
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers: NO_STORE })
  const access = await getUserAccess(client, user.id)
  const response = NextResponse.json({ access }, { headers: NO_STORE })
  if (!access.continuity && !access.temporarilyUnavailable) {
    const token = signContinuity(user.id, access, process.env.BILLING_ACCESS_SIGNING_SECRET ?? '')
    response.cookies.set(CONTINUITY_COOKIE, token ?? '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: token ? CONTINUITY_SECONDS : 0 })
  }
  return response
}
