'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CheckIn } from '@/lib/types'
import { useAccess } from '@/components/access/AccessProvider'
import { hasCoreRestrictions } from '@/lib/access/entitlements'

const MOOD_COLORS: Record<string, string> = {
  tense: "var(--error)",
  meh: '#ad5a20',
  steady: '#5a7396',
  grounded: "var(--green)",
  thriving: '#256440',
}

const TIME_FILTERS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
]

function buildSvgPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const cpx = (points[i - 1].x + points[i].x) / 2
    d += ` C ${cpx} ${points[i - 1].y} ${cpx} ${points[i].y} ${points[i].x} ${points[i].y}`
  }
  return d
}

export default function PatternMapPage() {
  const supabase = createClient()
  const access = useAccess()
  const isCore = hasCoreRestrictions(access)
  const [activeFilter, setActiveFilter] = useState(() => isCore ? 0 : 1)
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const days = TIME_FILTERS[activeFilter].days
      const since = days === null ? null : new Date()
      if (since && days !== null) since.setDate(since.getDate() - days)

      let query = supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (since) query = query.gte('created_at', since.toISOString())

      const { data } = await query

      setCheckIns(data ?? [])
      setLoading(false)
    }

    loadData()
  }, [activeFilter, supabase])

  // Build chart points
  const W = 342, H = 100, PAD = 20
  const chartPoints = checkIns.map((c, i) => ({
    x: PAD + (i / Math.max(checkIns.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - ((c.mood_score - 1) / 4) * (H - PAD * 2),
  }))

  const linePath = buildSvgPath(chartPoints)
  const areaPath = chartPoints.length > 0
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${H} L ${chartPoints[0].x} ${H} Z`
    : ''

  // Stats
  const avgMood = checkIns.length > 0
    ? Math.round((checkIns.reduce((s, c) => s + c.mood_score, 0) / checkIns.length) * 10) / 10
    : 0

  // Tag frequency
  const tagFreq: Record<string, number> = {}
  checkIns.forEach(c => {
    if (c.emotion_tags) c.emotion_tags.forEach(t => { tagFreq[t] = (tagFreq[t] ?? 0) + 1 })
  })
  const topTriggers = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxTagCount = topTriggers[0]?.[1] ?? 1

  // Trend
  let trendPct = 0
  if (checkIns.length >= 4) {
    const half = Math.floor(checkIns.length / 2)
    const firstHalf = checkIns.slice(0, half)
    const secondHalf = checkIns.slice(half)
    const avg1 = firstHalf.reduce((s, c) => s + c.mood_score, 0) / firstHalf.length
    const avg2 = secondHalf.reduce((s, c) => s + c.mood_score, 0) / secondHalf.length
    trendPct = Math.round(((avg2 - avg1) / avg1) * 100)
  }

  const triggerColors = ["var(--error)", "var(--orange)", "var(--orange)", "var(--green)", "var(--green)"]

  return (
    <div style={{ background: "var(--cream)", minHeight: '100%', paddingBottom: '16px' }}>

      {/* Header */}
      <div style={{ padding: "16px 20px 0" }}>
        <Link href="/goals" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: "var(--muted)", textDecoration: 'none', fontSize: "16px", marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to Goals
        </Link>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '8px' }}>
          Emotional Pattern Map
        </p>
        <h2 style={{ fontFamily: "var(--font-adult)", fontSize: '22px', color: "var(--ink)", fontWeight: 400, lineHeight: 1.3, marginBottom: '4px' }}>
          Your Inner Landscape
        </h2>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.4 }}>
          Your emotional rhythm — your data, your story.
        </p>
      </div>

      {/* Time filter */}
      <div style={{ display: 'flex', gap: '6px', margin: "16px 20px 0" }}>
        {TIME_FILTERS.map((f, i) => {
          const locked = isCore && (f.days === null || f.days > (access.limits.patternHistoryDays ?? 7))
          return (
          <button
            key={f.label}
            onClick={() => { if (!locked) setActiveFilter(i) }}
            disabled={locked}
            title={locked ? 'Available with Arize Plus' : undefined}
            style={{
              fontSize: "14px", padding: '6px 14px', borderRadius: '100px',
              background: activeFilter === i ? "var(--green-soft)" : "var(--surface)",
              border: `1px solid ${activeFilter === i ? 'var(--border)' : 'var(--border)'}`,
              color: activeFilter === i ? "var(--green)" : "var(--muted)",
              cursor: locked ? 'not-allowed' : 'pointer', fontFamily: "var(--font-adult)",
              opacity: locked ? 0.58 : 1, display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}
          >
            {locked && <LockKeyhole size={11} />} {f.label}
          </button>
          )
        })}
      </div>

      {isCore && (
        <p style={{ margin: "10px 20px 0", fontSize: "14px", color: "var(--muted)" }}>
          Core shows 7 days. <Link href="/upgrade" style={{ color: "var(--green)", fontWeight: 600 }}>Unlock longer views with Plus.</Link>
        </p>
      )}

      {/* Chart */}
      <div style={{
        margin: "16px 20px 0", background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: '20px',
        padding: '16px', height: '160px', position: 'relative', overflow: 'hidden',
      }}>
        <p style={{ fontSize: "13px", color: "var(--muted)", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
          Mood Trend · {TIME_FILTERS[activeFilter].label}
        </p>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px' }}>
            <p style={{ fontSize: "14px", color: "var(--muted)" }}>Loading…</p>
          </div>
        ) : checkIns.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px' }}>
            <p style={{ fontSize: "14px", color: "var(--muted)", textAlign: 'center' }}>
              Complete Daily Resets to see your pattern here.
            </p>
          </div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} fill="none" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill="url(#wg)" />}
            {linePath && <path d={linePath} stroke="var(--green)" strokeWidth="2" fill="none" />}
            {chartPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="4" fill={MOOD_COLORS[checkIns[i].mood] ?? "var(--green)"} />
            ))}
            <text x="8" y="28" fill="var(--muted)" fontSize="8" fontFamily="var(--font-adult)">High</text>
            <text x="8" y={H - 6} fill="var(--muted)" fontSize="8" fontFamily="var(--font-adult)">Low</text>
          </svg>
        )}
      </div>

      {/* AI Insights */}
      <div style={{ margin: "16px 20px 0" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '10px' }}>
          Insights
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {checkIns.length === 0 ? (
            <div style={{ background: "var(--surface)", borderRadius: '12px', padding: '16px', border: "1px solid var(--border)" }}>
              <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.5 }}>
                Your insights will appear here after completing a few Daily Resets. Start today to begin building your pattern.
              </p>
            </div>
          ) : (
            <>
              {trendPct !== 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: '12px', padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: "var(--yellow-soft)", display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px' }}>
                    {trendPct > 0 ? '📈' : '📉'}
                  </div>
                  <div>
                    <p style={{ fontSize: "16px", color: "var(--ink)", fontWeight: 500, marginBottom: '4px' }}>
                      {trendPct > 0 ? `+${trendPct}%` : `${trendPct}%`} mood trend
                    </p>
                    <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.4 }}>
                      Your mood has {trendPct > 0 ? 'improved' : 'dipped'} {Math.abs(trendPct)}% over the last {TIME_FILTERS[activeFilter].label}. Average score: {avgMood}/5.
                    </p>
                  </div>
                </div>
              )}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: '12px', padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: "var(--green-soft)", display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px' }}>🌿</div>
                <div>
                  <p style={{ fontSize: "16px", color: "var(--ink)", fontWeight: 500, marginBottom: '4px' }}>
                    {checkIns.length} reset{checkIns.length !== 1 ? 's' : ''} completed
                  </p>
                  <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.4 }}>
                    You&apos;ve checked in {checkIns.length} time{checkIns.length !== 1 ? 's' : ''} in the last {TIME_FILTERS[activeFilter].label}. Each check-in is data for your growth.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Trigger heatmap */}
      {topTriggers.length > 0 && (
        <div style={{ margin: "16px 20px 0" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '12px' }}>
            Most Present Emotions
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {topTriggers.map(([tag, count], i) => (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: "14px", color: "var(--muted)", width: '100px', flexShrink: 0 }}>{tag}</span>
                <div style={{ flex: 1, height: '8px', background: "var(--surface-soft)", borderRadius: '100px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '100px',
                    background: triggerColors[i] ?? "var(--green)",
                    width: `${(count / maxTagCount) * 100}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: "14px", color: "var(--muted)", width: '22px', textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
