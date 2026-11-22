'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ArrowLeft, MessageCircle, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GoalCategory } from '@/lib/types'
import { useAccess } from '@/components/access/AccessProvider'
import { hasCoreRestrictions } from '@/lib/access/entitlements'

const CATEGORIES: GoalCategory[] = ['Career', 'Wellness', 'Reflection', 'Personal']

interface DraftGoal {
  id?: string
  title: string
  category: GoalCategory
  deadline: string
  notes: string
  isComplete: boolean
}

type StoredGoal = {
  id: string
  title: string
  category: string | null
  deadline: string | null
  notes: string | null
  is_complete: boolean
}

function getWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

export default function GoalSessionPage() {
  const router = useRouter()
  const supabase = createClient()
  const access = useAccess()
  const isCore = hasCoreRestrictions(access)
  const [goals, setGoals] = useState<DraftGoal[]>([{ title: '', category: 'Personal', deadline: '', notes: '', isComplete: false }])
  const [originalGoalIds, setOriginalGoalIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null)

  const [weekStart] = useState(getWeekStart)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  useEffect(() => {
    async function loadExisting() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('goals').select('*').eq('user_id', user.id)
        .eq('week_of', weekStart.toISOString().split('T')[0])
        .order('created_at', { ascending: true })

      if (data && data.length > 0) {
        setOriginalGoalIds(data.map((goal: StoredGoal) => goal.id))
        setGoals(data.map((g: StoredGoal) => ({
          id: g.id,
          title: g.title,
          category: g.category === 'Deliverable' || !CATEGORIES.includes(g.category as GoalCategory)
            ? 'Personal'
            : g.category as GoalCategory,
          deadline: g.deadline ?? '',
          notes: g.notes ?? '',
          isComplete: g.is_complete,
        })))
      }
    }
    loadExisting()
  }, [supabase, weekStart])

  function addGoal() {
    const activeGoalCount = goals.filter(goal => !goal.isComplete).length
    if (isCore && activeGoalCount >= (access.limits.activeGoals ?? 3)) {
      setError(`Core includes up to ${access.limits.activeGoals} active goals. Upgrade to Plus to add more.`)
      return
    }
    setError('')
    setGoals(prev => [...prev, { title: '', category: 'Personal', deadline: '', notes: '', isComplete: false }])
  }

  function removeGoal(i: number) {
    setGoals(prev => prev.filter((_, idx) => idx !== i))
    if (expandedNotes === i) setExpandedNotes(null)
  }

  function updateGoal(i: number, field: keyof DraftGoal, value: string) {
    setGoals(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: value } : g))
  }

  async function handleSave() {
    const validGoals = goals.filter(g => g.title.trim() || g.notes.trim())
    if (validGoals.length === 0) { setError('Add at least one goal to save.'); return }
    const activeGoalCount = validGoals.filter(goal => !goal.isComplete).length
    if (isCore && activeGoalCount > (access.limits.activeGoals ?? 3)) {
      setError(`Core includes up to ${access.limits.activeGoals} active goals. Complete or remove a goal, or upgrade to Plus.`)
      return
    }
    setError('')
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/sign-in'); return }

    const weekStr = weekStart.toISOString().split('T')[0]
    const retainedIds = validGoals.flatMap(goal => goal.id ? [goal.id] : [])
    const removedIds = originalGoalIds.filter(id => !retainedIds.includes(id))
    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('goals')
        .delete()
        .eq('user_id', user.id)
        .in('id', removedIds)
      if (deleteError) {
        setError('Failed to remove deleted goals. Please try again.')
        setSaving(false)
        return
      }
    }

    const existingGoals = validGoals.filter((goal): goal is DraftGoal & { id: string } => Boolean(goal.id))
    const newGoals = validGoals.filter(goal => !goal.id)

    const updateResults = await Promise.all(existingGoals.map(goal =>
      supabase.from('goals').update({
        title: goal.title.trim() || goal.notes.trim(),
        category: goal.category,
        deadline: goal.deadline || null,
        notes: goal.notes || null,
      }).eq('id', goal.id).eq('user_id', user.id)
    ))
    const updateError = updateResults.find(result => result.error)?.error
    if (updateError) {
      setError('Failed to update goals. Please try again.')
      setSaving(false)
      return
    }

    if (newGoals.length > 0) {
      const { error: insertError } = await supabase.from('goals').insert(
        newGoals.map(g => ({
        user_id: user.id,
        title: g.title.trim() || g.notes.trim(),
        category: g.category,
        deadline: g.deadline || null,
        notes: g.notes || null,
        week_of: weekStr,
        progress: 0,
        is_complete: false,
        }))
      )
      if (insertError) {
        setError('Failed to add goals. Please try again.')
        setSaving(false)
        return
      }
    }
    router.push('/goals')
  }

  return (
    <div style={{ background: "var(--cream)", minHeight: '100%', paddingBottom: '16px' }}>

      <div style={{ padding: "16px 20px 0" }}>
        <Link href="/goals" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: "var(--muted)", textDecoration: 'none', fontSize: "16px", marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to Goals
        </Link>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '8px' }}>
          Sunday Goal Session
        </p>
        <h2 style={{ fontFamily: "var(--font-adult)", fontSize: '22px', color: "var(--ink)", fontWeight: 400, lineHeight: 1.3, marginBottom: '4px' }}>
          Set Your Week
        </h2>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: '4px' }}>{weekLabel}</p>
        <p style={{ fontSize: "16px", fontFamily: "var(--font-adult)", fontStyle: 'italic', color: "var(--muted)", lineHeight: 1.5 }}>
          &ldquo;What would make this week feel intentional?&rdquo;
        </p>
      </div>

      <div style={{ margin: "16px 20px 0" }}>
        <Link href="/coach?prompt=help-goals" style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: "var(--green-soft)", border: "1px solid var(--border)",
          borderRadius: '12px', padding: '13px 16px', textDecoration: 'none',
        }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: "var(--green-soft)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>🌿</div>
          <div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--green)", marginBottom: '2px' }}>Ask Clarity Coach</p>
            <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.4 }}>Get help setting goals that align with your values</p>
          </div>
          <MessageCircle size={16} color="var(--green)" style={{ flexShrink: 0 }} />
        </Link>
      </div>

      <div style={{ margin: "20px 20px 0" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '12px' }}>
          Your Commitments
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {goals.map((goal, i) => (
            <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: '14px', padding: '16px' }}>
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  border: "2px solid var(--border)",
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: '10px', fontSize: "14px", color: "var(--muted)",
                }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor={`goal-title-${i}`}
                    style={{
                      display: 'block', fontSize: "13px", color: "var(--muted)",
                      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px',
                    }}
                  >
                    Commitment
                  </label>
                  <input
                    id={`goal-title-${i}`}
                    type="text"
                    value={goal.title}
                    onChange={e => updateGoal(i, 'title', e.target.value)}
                    placeholder="What are you committing to?"
                    style={{
                      width: '100%', background: "var(--surface-soft)",
                      border: "1px solid var(--border)", borderRadius: '8px',
                      color: "var(--ink)", fontSize: "16px", outline: 'none',
                      fontFamily: "var(--font-adult)", lineHeight: 1.4,
                      padding: '9px 10px', boxSizing: 'border-box',
                    }}
                  />
                </div>
                {goals.length > 1 && (
                  <button onClick={() => removeGoal(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: "var(--muted)", padding: '8px 0', flexShrink: 0 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Category + Deadline */}
              <div style={{ display: 'flex', gap: '8px', paddingLeft: '32px', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "13px", color: "var(--muted)", letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Category</label>
                  <select
                    value={goal.category}
                    onChange={e => updateGoal(i, 'category', e.target.value)}
                    style={{
                      width: '100%', background: "var(--surface-soft)",
                      border: "1px solid var(--border)", borderRadius: '8px',
                      color: "var(--ink)", fontSize: "14px", padding: '7px 10px',
                      outline: 'none', fontFamily: "var(--font-adult)", boxSizing: 'border-box',
                    }}>
                    {CATEGORIES.map(c => <option key={c} value={c} style={{ background: "var(--surface)" }}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "13px", color: "var(--muted)", letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Deadline</label>
                  <input
                    type="date"
                    value={goal.deadline}
                    onChange={e => updateGoal(i, 'deadline', e.target.value)}
                    style={{
                      width: '100%', background: "var(--surface-soft)",
                      border: "1px solid var(--border)", borderRadius: '8px',
                      color: goal.deadline ? "var(--ink)" : "var(--muted)", fontSize: "14px",
                      padding: '7px 10px', outline: 'none', fontFamily: "var(--font-adult)",
                      colorScheme: 'dark', boxSizing: 'border-box', minWidth: 0,
                    }}
                  />
                </div>
              </div>

              {/* Notes toggle */}
              <div style={{ paddingLeft: '32px' }}>
                <button
                  onClick={() => setExpandedNotes(expandedNotes === i ? null : i)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: "14px", color: "var(--muted)", padding: '0', fontFamily: "var(--font-adult)",
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                  {expandedNotes === i ? '▲' : '▼'} {goal.notes ? 'Edit goal' : 'Add goal'}
                </button>
                {expandedNotes === i && (
                  <textarea
                    value={goal.notes}
                    onChange={e => updateGoal(i, 'notes', e.target.value)}
                    placeholder="Add context, why this matters, or how you'll approach it…"
                    rows={3}
                    autoFocus
                    style={{
                      width: '100%', marginTop: '8px',
                      background: "var(--surface-soft)",
                      border: "1px solid var(--border)", borderRadius: '8px',
                      padding: '10px', fontSize: "14px", color: "var(--ink)",
                      lineHeight: 1.5, outline: 'none', fontFamily: "var(--font-adult)",
                      boxSizing: 'border-box', resize: 'none',
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {goals.length < 7 && (!isCore || goals.filter(goal => !goal.isComplete).length < (access.limits.activeGoals ?? 3)) && (
          <button onClick={addGoal}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', background: 'transparent',
              border: "1px dashed var(--border)", borderRadius: '12px',
              padding: '13px', color: "var(--muted)", fontSize: "16px",
              cursor: 'pointer', marginTop: '10px', fontFamily: "var(--font-adult)",
            }}>
            <Plus size={14} /> Add another commitment
          </button>
        )}
        {isCore && goals.filter(goal => !goal.isComplete).length >= (access.limits.activeGoals ?? 3) && (
          <div style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '10px', background: "var(--yellow-soft)", border: "1px solid var(--yellow)", color: "var(--muted)", fontSize: "14px", lineHeight: 1.5 }}>
            Core supports {access.limits.activeGoals} active goals. <Link href="/upgrade" style={{ color: "var(--green)", fontWeight: 600 }}>See Plus</Link> for unlimited goals.
          </div>
        )}
      </div>

      <div style={{ margin: "16px 20px 0", padding: '14px', background: "var(--yellow-soft)", borderRadius: '12px', border: "1px solid var(--yellow)" }}>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--green)", fontWeight: 600 }}>Tip:</span> Keep it to 3–5 meaningful commitments. Quality over quantity. These should stretch you without breaking you.
        </p>
      </div>

      {error && (
        <div style={{ margin: "12px 20px 0" }}>
          <p style={{ fontSize: "16px", color: "var(--error)", padding: '10px 14px', background: "var(--error-soft)", borderRadius: '8px' }}>{error}</p>
        </div>
      )}

      <div style={{ margin: "20px 20px 0" }}>
        <button onClick={handleSave} disabled={saving}
          style={{
            width: '100%', background: "var(--orange)", color: "var(--ink)", border: 'none', borderRadius: '12px', padding: '16px',
            fontSize: "16px", fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontFamily: "var(--font-adult)", opacity: saving ? 0.7 : 1,
          }}>
          {saving ? 'Saving…' : <><Sparkles size={16} /> Lock in my commitments</>}
        </button>
      </div>
    </div>
  )
}
