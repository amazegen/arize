'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User,
  AtSign,
  LogOut,
  Check,
  AlertCircle,
  ArrowLeft,
  MessageSquareText,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  FileText,
} from 'lucide-react'
import { getUsernameError, normalizeUsername } from '@/lib/profile/username'
import { createClient } from '@/lib/supabase/client'
import { useAccess } from '@/components/access/AccessProvider'
import { AccountDeletionPanel } from '@/components/billing/AccountDeletionPanel'

const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL?.trim() || '/feedback'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const access = useAccess()

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [clarityAdmin, setClarityAdmin] = useState(false)
  const [founderAdmin, setFounderAdmin] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/sign-in'); return }
      setUserId(user.id)
      const [permission, founderPermission] = await Promise.all([
        supabase.rpc('clarity_console_allowed', { p_edition: 'adult' }).abortSignal(AbortSignal.timeout(8_000)),
        supabase.rpc('founder_dashboard_allowed').abortSignal(AbortSignal.timeout(8_000)),
      ])
      setClarityAdmin(!permission.error && permission.data === true)
      setFounderAdmin(!founderPermission.error && founderPermission.data === true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, username')
        .eq('id', user.id)
        .single()
      if (profile) {
        setName(profile.name ?? '')
        setUsername(profile.username ?? '')
        setOriginalName(profile.name ?? '')
        setOriginalUsername(profile.username ?? '')
      }
    }
    load()
  }, [router, supabase])

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    setUsernameError('')
    setSaved(false)

    const trimmedUsername = normalizeUsername(username)
    const validationError = getUsernameError(username)
    if (validationError) {
      setUsernameError(validationError)
      setSaving(false)
      return
    }

    if (trimmedUsername && trimmedUsername !== originalUsername) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmedUsername)
        .neq('id', userId)
        .maybeSingle()
      if (existing) {
        setUsernameError('That username is already taken')
        setSaving(false)
        return
      }
    }

    const savedName = name.trim()
    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update({
        name: savedName || null,
        username: trimmedUsername || null,
      })
      .eq('id', userId)
      .select('name, username')
      .single()
    if (error || !updatedProfile) {
      setUsernameError(error?.code === '23505' ? 'That username is already taken' : 'Unable to save your profile')
      setSaving(false)
      return
    }

    await supabase.auth.updateUser({
      data: { full_name: savedName || null },
    })

    setName(updatedProfile.name ?? '')
    setUsername(updatedProfile.username ?? '')
    setOriginalName(updatedProfile.name ?? '')
    setOriginalUsername(updatedProfile.username ?? '')
    setSaving(false)
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  const hasChanges = name.trim() !== originalName || username.trim().toLowerCase() !== originalUsername

  return (
    <div className="settings-page" style={{ padding: "20px", maxWidth: '620px', margin: '0 auto' }}>
      <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: "var(--muted)", textDecoration: 'none', fontSize: "16px", marginBottom: '18px' }}>
        <ArrowLeft size={17} /> Back to Home
      </Link>
      <div className="adult-profile-identity">
        <span className="adult-avatar" aria-hidden="true">{(name.trim() || 'A').slice(0, 1).toUpperCase()}</span>
        <div><h1>{name.trim() || 'Your profile'}</h1><p>{username ? `@${username}` : 'Your space, your pace.'}</p></div>
      </div>
      <h2 className="adult-section-label">You</h2>
      <div className="adult-profile-links">
        <Link href="/reset/history">Your reflections <ChevronRight size={17} /></Link>
        <Link href="/goals/patterns">Your patterns <ChevronRight size={17} /></Link>
      </div>
      <h2 className="adult-section-label">Settings</h2>
      <nav aria-label="Profile sections" className="adult-profile-links">
        <a href="#profile-account">Account <ChevronRight size={17} /></a>
        <a href="#profile-membership">Membership <ChevronRight size={17} /></a>
        <a href="#profile-support">Help & privacy <ChevronRight size={17} /></a>
      </nav>

      <section id="profile-account" className="adult-panel adult-profile-section" aria-labelledby="profile-account-title">
      <h2 id="profile-account-title">Account</h2>
      <p className="adult-profile-description">Update how you appear in the Village.</p>

      {/* Name */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="profile-name" style={{ fontSize: "16px", fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: "var(--green)", display: 'block', marginBottom: '8px' }}>
          Display Name
        </label>
        <div style={{ position: 'relative' }}>
          <User size={16} color="var(--muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: '12px', padding: '14px 14px 14px 40px',
              color: "var(--ink)", fontSize: '15px', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Username */}
      <div style={{ marginBottom: '28px' }}>
        <label htmlFor="profile-username" style={{ fontSize: "16px", fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: "var(--green)", display: 'block', marginBottom: '8px' }}>
          Username
        </label>
        <div style={{ position: 'relative' }}>
          <AtSign size={16} color="var(--muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            id="profile-username"
            type="text"
            value={username}
            onChange={e => {
              setUsernameError('')
              setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, '').slice(0, 20))
            }}
            placeholder="your_handle"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: "var(--surface)", border: `1px solid ${usernameError ? 'var(--error)' : 'var(--border)'}`,
              borderRadius: '12px', padding: '14px 14px 14px 40px',
              color: "var(--ink)", fontSize: '15px', outline: 'none',
            }}
          />
        </div>
        {usernameError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            <AlertCircle size={13} color="var(--error)" />
            <span style={{ fontSize: "14px", color: "var(--error)" }}>{usernameError}</span>
          </div>
        )}
        <p style={{ fontSize: "14px", color: "var(--muted)", marginTop: '6px' }}>
          Letters, numbers, dots, and underscores only · max 20 chars
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        style={{
          width: '100%', padding: '15px',
          background: saved ? "var(--green-soft)" : hasChanges ? "var(--orange)" : "var(--surface-soft)",
          color: saved ? "var(--ink)" : hasChanges ? "var(--ink)" : "var(--muted)",
          border: 'none', borderRadius: '12px',
          fontSize: '15px', fontWeight: 600,
          cursor: hasChanges ? 'pointer' : 'default',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {saved ? <><Check size={16} /> Saved</> : saving ? 'Saving…' : 'Save Changes'}
      </button>
      </section>

      {/* Membership */}
      <section id="profile-membership" className="adult-panel adult-profile-section" aria-label="Membership">
        <p style={{ fontSize: "14px", fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '10px' }}>
          Membership
        </p>
        <Link href="/upgrade" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: "var(--yellow-soft)", border: "1px solid var(--yellow)", color: "var(--ink)", textDecoration: 'none' }}>
          <Sparkles size={18} color="var(--green)" />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: "16px", fontWeight: 600 }}>
              {access.billingEnabled ? `Arize ${access.plan === 'plus' ? 'Plus' : 'Core'}` : 'Full launch access'}
            </span>
            <span style={{ display: 'block', fontSize: "14px", color: "var(--muted)", marginTop: '2px' }}>
              {access.billingEnabled ? 'View your plan and membership options' : 'Preview the upcoming Core and Plus plans'}
            </span>
          </span>
          <ChevronRight size={17} color="var(--muted)" />
        </Link>
      </section>

      {clarityAdmin ? <Link href="/admin/clarity" className="adult-secondary" style={{ display: 'inline-flex', margin: '20px 0' }}>Clarity AI configuration</Link> : null}
      {founderAdmin ? <Link href="/admin/founder" className="adult-secondary" style={{ display: 'inline-flex', margin: '20px 0' }}>Founder overview</Link> : null}
      {/* Support and privacy */}
      <section id="profile-support" className="adult-panel adult-profile-section" aria-label="Support and privacy">
        <p style={{ fontSize: "14px", fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '10px' }}>
          Support & Privacy
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <a
            href={feedbackUrl}
            target={feedbackUrl.startsWith('http') ? '_blank' : undefined}
            rel={feedbackUrl.startsWith('http') ? 'noreferrer' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 16px', borderRadius: '12px',
              background: "var(--surface)", border: "1px solid var(--border)",
              color: "var(--ink)", textDecoration: 'none',
            }}
          >
            <MessageSquareText size={18} color="var(--green)" />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: "16px", fontWeight: 600 }}>Share feedback</span>
              <span style={{ display: 'block', fontSize: "14px", color: "var(--muted)", marginTop: '2px' }}>Help us improve Arize</span>
            </span>
            <ChevronRight size={17} color="var(--muted)" />
          </a>

          <a href="https://amazegen.com/privacy.html" target="_blank" rel="noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 16px', borderRadius: '12px',
            background: "var(--surface-soft)", border: "1px solid var(--border)",
            color: "var(--muted)", textDecoration: 'none',
          }}>
            <ShieldCheck size={18} color="var(--green)" />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: "16px", color: "var(--ink)", fontWeight: 600 }}>Privacy Policy</span>
              <span style={{ display: 'block', fontSize: "14px", marginTop: '2px' }}>Read how your information is handled</span>
            </span>
            <ChevronRight size={17} color="var(--muted)" />
          </a>

          <a href="https://amazegen.com/terms.html" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: "var(--surface-soft)", border: "1px solid var(--border)", color: "var(--muted)", textDecoration: 'none' }}>
            <FileText size={18} color="var(--green)" />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: "16px", color: "var(--ink)", fontWeight: 600 }}>Terms of Use</span>
              <span style={{ display: 'block', fontSize: "14px", marginTop: '2px' }}>Review the terms for using Arize</span>
            </span>
            <ChevronRight size={17} color="var(--muted)" />
          </a>
        </div>
      </section>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        style={{
          width: '100%', padding: '15px',
          background: 'var(--surface)',
          border: "1px solid var(--border)",
          borderRadius: '20px', color: "var(--green)",
          fontSize: '15px', fontWeight: 500,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        <LogOut size={16} /> Sign Out
      </button>
      <AccountDeletionPanel />
    </div>
  )
}
