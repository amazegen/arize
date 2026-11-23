import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Native endpoints require a separately verified bearer + live Auth session.
  // Never turn a missing bearer into cookie authentication or weaken web CSRF.
  if (request.nextUrl.pathname.startsWith('/api/native/v1/')) return NextResponse.next()
  // Public resources never refresh Auth or cache private pages. Dispatch applies
  // its own independent server secret; the worker has no fetch/cache handler.
  if (['/push-sw.js', '/manifest.webmanifest', '/api/notifications/dispatch'].includes(request.nextUrl.pathname)) {
    if (process.env.ARIZE_EDITION === 'student') return new NextResponse('Not found', { status: 404 })
    return NextResponse.next()
  }
  // Public marketing must render even if Auth is unavailable. The lead endpoint
  // applies its own adult-edition, origin, validation and rate-limit checks.
  if (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/api/marketing/leads') {
    if (process.env.ARIZE_EDITION === 'student') return new NextResponse('Not found', { status: 404 })
    return NextResponse.next()
  }
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protected routes — require auth
  const protectedPaths = ['/home', '/reset', '/goals', '/village', '/coach', '/settings', '/onboarding', '/consent']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  // Auth routes — redirect to home if already logged in
  const authPaths = ['/sign-in', '/sign-up']
  const isAuthRoute = authPaths.includes(pathname)

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
