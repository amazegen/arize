'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, TrendingUp, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Goal } from '@/lib/types'
import { useAccess } from '@/components/access/AccessProvider'
import { hasCoreRestrictions } from '@/lib/access/entitlements'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function GoalsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const access = useAccess()
  const isCore = hasCoreRestrictions(access)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const updating = useRef(new Set<string>())
  const [today] = useState(new Date())
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const [selectedDay, setSelectedDay] = useState(today.getDay())
  const currentWeekStart = getWeekStart(today)
  const weekKey = dateKey(weekStart)
  const isCurrentWeek = weekKey === dateKey(currentWeekStart)

  useEffect(() => {
    let canceled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .gte('week_of', dateKey(weekStart))
        .lt('week_of', dateKey(weekEnd))
        .order('created_at', { ascending: true })

      if (canceled) return
      setError(error ? 'We could not load your goals. Try changing the week or refresh the page.' : '')
      if (!error) setGoals(data ?? [])
      setLoading(false)
    }
    load()
    return () => { canceled = true }
  }, [supabase, weekKey, weekStart])

  async function toggleGoal(goal: Goal) {
    if (updating.current.has(goal.id)) return
    updating.current.add(goal.id)
    setError('')
    const updated = !goal.is_complete
    const { error, data } = await supabase.from('goals').update({
      is_complete: updated,
      progress: updated ? 100 : goal.progress,
    }).eq('id', goal.id).select('id').maybeSingle()
    updating.current.delete(goal.id)
    if (error || !data) { setError('That goal was not changed. Check your connection or active-goal limit and try again.'); return }
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, is_complete: updated, progress: updated ? 100 : g.progress } : g))
  }

  const weekLabel = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  const doneCount = goals.filter(g => g.is_complete).length
  const selectedDate = new Date(weekStart)
  selectedDate.setDate(selectedDate.getDate() + selectedDay)
  const selectedDateKey = dateKey(selectedDate)
  const selectedGoals = goals.filter(goal => !goal.deadline || goal.deadline === selectedDateKey)
  const selectedDayLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  function moveWeek(direction: -1 | 1) {
    if (direction === -1 && isCore && isCurrentWeek) {
      router.push('/upgrade')
      return
    }
    const nextWeek = new Date(weekStart)
    nextWeek.setDate(nextWeek.getDate() + direction * 7)
    if (nextWeek > currentWeekStart) return
    setLoading(true)
    setWeekStart(nextWeek)
  }

  return (
    <div style={{ background: "var(--cream)", minHeight: '100%', paddingBottom: '16px' }}>
      {error && <p role="alert" className="billing-notice">{error}</p>}

      {/* Header */}
      <div style={{ padding: "20px 20px 0" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '8px' }}>
          Goals & Accountability
        </p>
        <h1>Goals</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6 }}>Small steps you choose.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
          <button onClick={() => moveWeek(-1)} aria-label="View previous week" style={{ width: '30px', height: '30px', borderRadius: '50%', border: "1px solid var(--border)", background: "var(--surface)", color: "var(--muted)", display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={16} />
          </button>
          <p style={{ fontSize: "14px", color: "var(--muted)", flex: 1 }}>
            {weekLabel} · {doneCount} of {goals.length} complete
          </p>
          <button onClick={() => moveWeek(1)} disabled={isCurrentWeek} aria-label="View next week" style={{ width: '30px', height: '30px', borderRadius: '50%', border: "1px solid var(--border)", background: "var(--surface)", color: "var(--muted)", display: 'grid', placeItems: 'center', cursor: isCurrentWeek ? 'default' : 'pointer', opacity: isCurrentWeek ? 0.3 : 1 }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week rhythm */}
      <div style={{ margin: "18px 20px 0", display: 'flex', gap: '6px' }}>
        {DAY_LABELS.map((day, i) => {
          const dayDate = new Date(weekStart)
          dayDate.setDate(dayDate.getDate() + i)
          const isToday = dateKey(dayDate) === dateKey(today)
          const isPast = dayDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())
          const isSelected = i === selectedDay
          return (
            <button key={day} onClick={() => setSelectedDay(i)} aria-label={`View goals for ${dayDate.toLocaleDateString()}`} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '6px', padding: '10px 4px', borderRadius: '8px',
              background: isSelected ? "var(--yellow-soft)" : "var(--surface)",
              border: `1px solid ${isSelected ? 'var(--green)' : isToday ? 'var(--yellow)' : 'var(--border)'}`,
              fontSize: "13px",
              color: isSelected ? "var(--green)" : "var(--muted)",
              letterSpacing: '0.05em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: "var(--font-adult)",
            }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: isPast ? "var(--green)" : isToday ? "var(--orange)" : "var(--surface-soft)",
              }} />
              <span style={{ whiteSpace: 'nowrap' }}>{day}</span>
              <span style={{ fontSize: "13px" }}>{dayDate.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* Sunday session banner */}
      {isCurrentWeek && (
      <div style={{
        margin: "16px 20px 0",
        background: "var(--green-soft)",
        border: "1px solid var(--yellow)",
        borderRadius: '20px', padding: '18px', position: 'relative', overflow: 'hidden',
      }}>
        <span style={{
          position: 'absolute', right: '16px', top: '14px',
          fontSize: "13px", letterSpacing: '0.2em', color: "var(--green)", fontWeight: 600,
        }}>SUNDAY</span>
        <p style={{ fontSize: "13px", letterSpacing: '0.12em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '6px' }}>
          Sunday Goal Session
        </p>
        <h3 style={{ fontFamily: "var(--font-adult)", fontSize: '16px', color: "var(--ink)", fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: '14px' }}>
          &ldquo;Set the week from a place<br />of intention, not reaction.&rdquo;
        </h3>
        <Link href="/goals/session" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: "var(--yellow-soft)", border: "1px solid var(--green)",
          color: "var(--green)", fontSize: "14px", fontWeight: 500,
          padding: '8px 16px', borderRadius: '100px',
          textDecoration: 'none',
        }}>
          ✦ {goals.length > 0 ? 'Edit this week\'s goals' : 'Start this week\'s session'}
        </Link>
      </div>
      )}

      {/* Pattern Map link */}
      <div style={{ margin: "12px 20px 0" }}>
        <Link href="/goals/patterns" style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: "var(--green-soft)", border: "1px solid var(--border)",
          borderRadius: '12px', padding: '13px 16px', textDecoration: 'none',
        }}>
          <TrendingUp size={16} color="var(--green)" />
          <span style={{ flex: 1, fontSize: "16px", color: "var(--ink)" }}>View your Pattern Map</span>
          <span style={{ fontSize: "14px", color: "var(--green)" }}>{isCore ? '7-day view' : 'All-time views'} →</span>
        </Link>
      </div>

      {/* Goals list */}
      <div style={{ margin: "16px 20px 0" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '4px' }}>
          {selectedDayLabel}
        </p>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: '12px' }}>
          Dated goals for this day plus your week-long commitments
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontSize: "16px", color: "var(--muted)" }}>Loading goals…</p>
          </div>
        ) : selectedGoals.length === 0 ? (
          <div style={{
            background: "var(--surface)", border: "1px dashed var(--border)",
            borderRadius: '12px', padding: '28px', textAlign: 'center',
          }}>
            <p style={{ fontSize: "16px", color: "var(--muted)", marginBottom: '12px', lineHeight: 1.5 }}>
              No goals are scheduled for this day.
            </p>
            {isCurrentWeek && (
              <Link href="/goals/session" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: "var(--orange)", color: "var(--ink)", textDecoration: 'none',
                padding: '10px 20px', borderRadius: '100px', fontSize: "16px", fontWeight: 600,
              }}>
                <Plus size={14} /> Set your goals
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedGoals.map(goal => (
              <div
                key={goal.id}
                className="adult-goal-row"
                data-complete={goal.is_complete}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: '12px', padding: '14px 16px',
                  opacity: 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                  <button
                    onClick={() => toggleGoal(goal)}
                    className="adult-goal-toggle"
                    aria-label={`${goal.is_complete ? 'Mark incomplete' : 'Complete goal'}: ${goal.title}`}
                    aria-pressed={goal.is_complete}
                    style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      border: `2px solid ${goal.is_complete ? 'var(--border)' : 'var(--border)'}`,
                      background: goal.is_complete ? "var(--green)" : 'transparent',
                      flexShrink: 0, marginTop: '2px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: "13px",
                    }}
                  >
                    {goal.is_complete && <Check size={12} strokeWidth={3} />}
                  </button>
                  <span style={{
                    fontSize: "16px", color: goal.is_complete ? "var(--muted)" : "var(--ink)",
                    lineHeight: 1.4, flex: 1,
                  }}>
                    {goal.title}
                  </span>
                </div>
                <div style={{ height: '4px', background: "var(--surface-soft)", borderRadius: '100px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '100px',
                    background: goal.is_complete ? "var(--green)" : "var(--orange)",
                    width: `${goal.progress}%`, transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: "13px", color: "var(--muted)" }}>
                  <span>{goal.category}</span>
                  <span>{goal.is_complete ? 'Done ✓' : `${goal.progress}%`}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {isCurrentWeek && <Link href="/goals/session" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          background: 'transparent', border: "1px dashed var(--border)",
          borderRadius: '12px', padding: '14px', color: "var(--muted)",
          fontSize: "16px", textDecoration: 'none', marginTop: '10px',
          transition: 'all 0.2s',
        }}>
          <Plus size={14} /> Add a new commitment
        </Link>}
      </div>

      {/* Friday reflection link */}
      <div style={{ margin: "16px 20px 0" }}>
        <Link href="/goals/friday-reflection" style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: "var(--yellow-soft)", border: "1px solid var(--yellow)",
          borderRadius: '12px', padding: '13px 16px', textDecoration: 'none',
        }}>
          <span style={{ fontSize: '16px' }}>🪞</span>
          <span style={{ flex: 1, fontSize: "16px", color: "var(--ink)" }}>Friday Reflection</span>
          <span style={{ fontSize: "14px", color: "var(--green)" }}>Close the week →</span>
        </Link>
      </div>
    </div>
  )
}
