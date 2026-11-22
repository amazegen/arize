import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import {
  MAX_COACH_BODY_BYTES,
  validateCoachRequest,
} from '@/lib/coach/request'
import { getUserAccess } from '@/lib/access/server'
import { providerFailure } from '@/lib/clarity/safety'
import { generateAdultReply } from '@/lib/clarity/adult-generation'

const fallbackQuotaRequests = new Map<string, number[]>()

function consumeFallbackQuota(userId: string, dailyLimit: number, monthlyLimit: number) {
  const now = Date.now()
  const oneMinuteAgo = now - 60_000
  const oneDayAgo = now - 86_400_000
  const currentDate = new Date(now)
  const monthStart = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 1)
  const recentRequests = (fallbackQuotaRequests.get(userId) ?? [])
    .filter(timestamp => timestamp >= monthStart)

  if (recentRequests.filter(timestamp => timestamp >= oneMinuteAgo).length >= 10) {
    return { allowed: false, retry_after_seconds: 60 }
  }
  if (recentRequests.filter(timestamp => timestamp >= oneDayAgo).length >= dailyLimit) {
    return { allowed: false, retry_after_seconds: 3600 }
  }
  if (recentRequests.length >= monthlyLimit) {
    return { allowed: false, retry_after_seconds: 86_400 }
  }

  recentRequests.push(now)
  fallbackQuotaRequests.set(userId, recentRequests)
  return { allowed: true, retry_after_seconds: 0 }
}

function isMissingQuotaFunction(error: { code?: string; message?: string }, functionName: string) {
  return error.code === 'PGRST202'
    || error.code === '42883'
    || error.message?.includes(functionName)
}

export async function POST(request: NextRequest) {
  if (process.env.ARIZE_EDITION === 'student') return new Response(null, { status: 404 })
  try {
    // Verify auth
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const access = await getUserAccess(supabase, user.id)

    // Get user context (recent mood + goals)
    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
    const { data: recentCheckIn } = await supabase
      .from('check_ins')
      .select('mood, emotion_tags, energy')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const { data: goals } = await supabase
      .from('goals')
      .select('title, category, is_complete')
      .eq('user_id', user.id)
      .eq('is_complete', false)
      .limit(3)

    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_COACH_BODY_BYTES) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 })
    }

    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_COACH_BODY_BYTES) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    }

    const validated = validateCoachRequest(body)
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 })
    }

    const { data: databaseQuota, error: quotaError } = await supabase.rpc('consume_coach_quota_for_plan', {
      p_daily_limit: access.limits.coachMessagesPerDay,
      p_monthly_limit: access.limits.coachMessagesPerMonth,
    })
    let quota = databaseQuota
    if (quotaError) {
      if (!isMissingQuotaFunction(quotaError, 'consume_coach_quota_for_plan')) {
        console.error('[coach quota]', { code: quotaError.code })
        return Response.json({ error: 'Coach is temporarily unavailable' }, { status: 503 })
      }

      if (access.billingEnabled) {
        console.error('[coach quota] tier-aware quota function is required when billing is enabled')
        return Response.json({ error: 'Coach membership limits are temporarily unavailable' }, { status: 503 })
      }

      // Until the new migration is installed, retain the existing durable
      // launch quota rather than silently relying on a single server instance.
      const { data: legacyQuota, error: legacyQuotaError } = await supabase.rpc('consume_coach_quota')
      if (!legacyQuotaError) {
        quota = legacyQuota
      } else if (isMissingQuotaFunction(legacyQuotaError, 'consume_coach_quota')) {
        console.warn('[coach quota] database functions unavailable; using instance fallback')
        quota = consumeFallbackQuota(
          user.id,
          access.limits.coachMessagesPerDay,
          access.limits.coachMessagesPerMonth,
        )
      } else {
        console.error('[coach quota]', { code: legacyQuotaError.code })
        return Response.json({ error: 'Coach is temporarily unavailable' }, { status: 503 })
      }
    }
    if (!quota?.allowed) {
      return Response.json(
        { error: 'You have reached your Clarity message limit for this period.' },
        {
          status: 429,
          headers: { 'Retry-After': String(quota?.retry_after_seconds ?? 60) },
        },
      )
    }

    const userContext = {
      name: profile?.name ?? null,
      recent_check_in: recentCheckIn
        ? {
            mood: recentCheckIn.mood,
            energy: recentCheckIn.energy,
            emotion_tags: recentCheckIn.emotion_tags ?? [],
          }
        : null,
      active_goals: goals?.map((goal) => ({
        title: goal.title,
        category: goal.category,
      })) ?? [],
    }
    const result = await generateAdultReply(supabase, validated.messages, userContext)
    return new Response(result.content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store',
        'X-Clarity-Input-Blocked': String(result.inputBlocked), 'X-Clarity-Version': result.version },
    })
  } catch (err) {
    console.error(providerFailure('adult-coach', err))
    return Response.json({ error: 'Clarity safety checks or generation are temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
