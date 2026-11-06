'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AccountDeletionPanel({ pending = false }: { pending?: boolean }) {
  const router = useRouter()
  const [phrase, setPhrase] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: phrase, acknowledged }), signal: AbortSignal.timeout(65_000),
      })
      const result = await response.json()
      if (!response.ok || !result.deleted) throw new Error(result.error ?? 'Deletion has not finished. Please retry.')
      router.replace('/sign-in?account=deleted')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Deletion has not been confirmed. Please retry here to check and continue.')
      setBusy(false)
    }
  }
  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/sign-in')
    router.refresh()
  }
  return <section className="account-deletion" aria-labelledby="deletion-title">
    <h2 id="deletion-title">{pending ? 'Finish deleting your account' : 'Delete account'}</h2>
    <p>This permanently deletes your Arize profile, goals, check-ins, saved chats and owned uploads, and stops recurring membership billing. This cannot be undone.</p>
    <p>Payment records required by Stripe or law, backups until their normal expiry, and copies already downloaded by others may remain. This does not promise deletion of provider safety logs.</p>
    {pending && <p role="status">Your deletion request is in progress. App access is paused. Retry below to finish, or sign out and sign back in if asked to verify your identity.</p>}
    <form onSubmit={submit}>
      <label htmlFor="delete-phrase">Type DELETE MY ACCOUNT</label>
      <input id="delete-phrase" value={phrase} onChange={e => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} required />
      <label className="deletion-ack"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required /> I understand this is permanent and my membership will be canceled.</label>
      <button type="submit" disabled={busy || phrase !== 'DELETE MY ACCOUNT' || !acknowledged}>{busy ? 'Finishing deletion…' : pending ? 'Retry account deletion' : 'Permanently delete my account'}</button>
    </form>
    {message && <p role="alert">{message}</p>}
    <button type="button" onClick={signOut} disabled={busy} className="deletion-signout">Sign out</button>
  </section>
}
