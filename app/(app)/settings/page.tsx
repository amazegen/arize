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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/sign-in'); return }
      setUserId(user.id)
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
    <div className="settings-page" style={{ padding: '24px', maxWidth: '620px', margin: '0 auto' }}>
      <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#BDB5A0', textDecoration: 'none', fontSize: '13px', marginBottom: '18px' }}>
        <ArrowLeft size={17} /> Back to Home
      </Link>
      <h1 style={{
        fontFamily: 'var(--font-playfair)',
        fontSize: '26px', color: '#F5F0E8',
        fontWeight: 500, marginBottom: '8px',
      }}>
        Profile & Settings
      </h1>
      <p style={{ fontSize: '13px', color: '#BDB5A0', marginBottom: '32px' }}>
        Update how you appear in the Village
      </p>

      {/* Name */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="profile-name" style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A227', display: 'block', marginBottom: '8px' }}>
          Display Name
        </label>
        <div style={{ position: 'relative' }}>
          <User size={16} color="#BDB5A0" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1A2E1E', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', padding: '14px 14px 14px 40px',
              color: '#F5F0E8', fontSize: '15px', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Username */}
      <div style={{ marginBottom: '28px' }}>
        <label htmlFor="profile-username" style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A227', display: 'block', marginBottom: '8px' }}>
          Username
        </label>
        <div style={{ position: 'relative' }}>
          <AtSign size={16} color="#BDB5A0" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
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
              background: '#1A2E1E', border: `1px solid ${usernameError ? 'rgba(196,97,74,0.6)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '12px', padding: '14px 14px 14px 40px',
              color: '#F5F0E8', fontSize: '15px', outline: 'none',
            }}
          />
        </div>
        {usernameError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            <AlertCircle size={13} color="#C4614A" />
            <span style={{ fontSize: '12px', color: '#C4614A' }}>{usernameError}</span>
          </div>
        )}
        <p style={{ fontSize: '12px', color: '#BDB5A0', marginTop: '6px' }}>
          Letters, numbers, dots, and underscores only · max 20 chars
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        style={{
          width: '100%', padding: '15px',
          background: saved ? '#4A7C59' : hasChanges ? '#C9A227' : 'rgba(255,255,255,0.08)',
          color: saved ? '#F5F0E8' : hasChanges ? '#0E1C12' : '#BDB5A0',
          border: 'none', borderRadius: '12px',
          fontSize: '15px', fontWeight: 600,
          cursor: hasChanges ? 'pointer' : 'default',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {saved ? <><Check size={16} /> Saved</> : saving ? 'Saving…' : 'Save Changes'}
      </button>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '36px 0' }} />

      {/* Membership */}
      <div style={{ marginBottom: '36px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A227', marginBottom: '10px' }}>
          Membership
        </p>
        <Link href="/upgrade" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(201,162,39,0.12), rgba(74,124,89,0.12))', border: '1px solid rgba(201,162,39,0.24)', color: '#F5F0E8', textDecoration: 'none' }}>
          <Sparkles size={18} color="#C9A227" />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>
              {access.billingEnabled ? `Arize ${access.plan === 'plus' ? 'Plus' : 'Core'}` : 'Full launch access'}
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: '#BDB5A0', marginTop: '2px' }}>
              {access.billingEnabled ? 'View your plan and membership options' : 'Preview the upcoming Core and Plus plans'}
            </span>
          </span>
          <ChevronRight size={17} color="#BDB5A0" />
        </Link>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '0 0 36px' }} />

      {/* Support and privacy */}
      <div style={{ marginBottom: '36px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A227', marginBottom: '10px' }}>
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
              background: '#1A2E1E', border: '1px solid rgba(255,255,255,0.08)',
              color: '#F5F0E8', textDecoration: 'none',
            }}
          >
            <MessageSquareText size={18} color="#C9A227" />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>Share feedback</span>
              <span style={{ display: 'block', fontSize: '12px', color: '#BDB5A0', marginTop: '2px' }}>Help us improve Arize</span>
            </span>
            <ChevronRight size={17} color="#BDB5A0" />
          </a>

          <a href="https://amazegen.com/privacy.html" target="_blank" rel="noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 16px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            color: '#BDB5A0', textDecoration: 'none',
          }}>
            <ShieldCheck size={18} color="#6B9E7A" />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', color: '#F5F0E8', fontWeight: 600 }}>Privacy Policy</span>
              <span style={{ display: 'block', fontSize: '12px', marginTop: '2px' }}>Read how your information is handled</span>
            </span>
            <ChevronRight size={17} color="#BDB5A0" />
          </a>

          <a href="https://amazegen.com/terms.html" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#BDB5A0', textDecoration: 'none' }}>
            <FileText size={18} color="#6B9E7A" />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', color: '#F5F0E8', fontWeight: 600 }}>Terms of Use</span>
              <span style={{ display: 'block', fontSize: '12px', marginTop: '2px' }}>Review the terms for using Arize</span>
            </span>
            <ChevronRight size={17} color="#BDB5A0" />
          </a>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '0 0 36px' }} />

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        style={{
          width: '100%', padding: '15px',
          background: 'transparent',
          border: '1px solid rgba(196,97,74,0.3)',
          borderRadius: '12px', color: '#C4614A',
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
