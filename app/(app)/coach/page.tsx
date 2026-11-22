'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Send, History, Plus, X, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversation, CoachMessage, SavedCoachMessage } from '@/lib/types'
import { useAccess } from '@/components/access/AccessProvider'
import { hasCoreRestrictions } from '@/lib/access/entitlements'

const INITIAL_MESSAGE: CoachMessage = {
  role: 'assistant',
  content: "I'm Clarity, your AI coach. I'm here to help you navigate whatever's coming up — whether you need to prepare for a hard conversation, process something from today, or just think out loud.\n\nWhat's on your mind?",
}

const SUGGESTED_PROMPTS = [
  { prefix: 'Reframe', text: 'Help me reframe this situation before I react' },
  { prefix: 'Prepare', text: 'Prep me for a hard conversation with my manager' },
  { prefix: 'Process', text: 'I need to talk through what happened today' },
  { prefix: 'Goals', text: 'Help me set goals that actually align with my values' },
]

export default function CoachPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const access = useAccess()
  const isCore = hasCoreRestrictions(access)

  const [messages, setMessages] = useState<(CoachMessage & { excludedFromContext?: boolean })[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState(() =>
    searchParams.get('prompt') === 'help-goals'
      ? 'I want to set meaningful goals for this week. Can you help me think through what matters most right now?'
      : '',
  )
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [recentMood, setRecentMood] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<CoachConversation[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function loadContext() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      let conversationQuery = supabase
        .from('coach_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (access.limits.coachConversationHistory !== null) {
        conversationQuery = conversationQuery.limit(access.limits.coachConversationHistory)
      }
      const { data: conversationData } = await conversationQuery
      setConversations((conversationData ?? []) as CoachConversation[])
      setHistoryLoading(false)

      const { data: profileRaw } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const profile = profileRaw as { name: string | null } | null
      const { data: checkInRaw } = await supabase
        .from('check_ins')
        .select('mood, emotion_tags')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const checkIn = checkInRaw as { mood: string; emotion_tags: string[] | null } | null

      if (checkIn) {
        setRecentMood(checkIn.mood)
        // Contextual opening based on mood data
        const tags = checkIn.emotion_tags ?? []
        if (tags.length > 0) {
          const tagList = tags.slice(0, 2).join(' and ')
          const contextualOpening: CoachMessage = {
            role: 'assistant',
            content: `${profile?.name ? profile.name.split(' ')[0] + ', I' : 'I'} see you were feeling ${tagList} in your last check-in. Do you want to talk through what's been happening, or would it help to work on something specific today?`,
          }
          setMessages(previous => previous.length === 1 && previous[0] === INITIAL_MESSAGE ? [contextualOpening] : previous)
        }
      }
    }
    loadContext()

    // Handle ?prompt=help-goals from Sunday Goal Session
    if (searchParams.get('prompt') === 'help-goals') {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [supabase, searchParams, access.limits.coachConversationHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(content?: string) {
    const messageContent = content ?? input.trim()
    if (!messageContent || streaming) return

    setInput('')
    setError('')

    const userMsg: CoachMessage = { role: 'user', content: messageContent }
    const updatedMessages: (CoachMessage & { excludedFromContext?: boolean })[] = [...messages, userMsg]
    setMessages(updatedMessages)
    setStreaming(true)

    // Add empty assistant message to stream into
    const assistantMsg: CoachMessage = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      let activeUserId = userId
      if (!activeUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        activeUserId = user?.id ?? null
        if (activeUserId) setUserId(activeUserId)
      }
      if (!activeUserId) throw new Error('Unauthorized')

      // The server must approve the input before any raw user text or title is saved.
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages.filter(message => !message.excludedFromContext).slice(-16).map(m => ({ role: m.role, content: m.content })) }),
      })
      if (!response.ok) {
        const responseError = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(responseError?.error || 'Failed to get response')
      }
      const inputBlocked = response.headers.get('X-Clarity-Input-Blocked') === 'true'
      if (inputBlocked) setMessages(current => current.map((message, index) => index >= updatedMessages.length - 1 ? { ...message, excludedFromContext: true } : message))
      let activeConversationId = inputBlocked ? null : conversationId
      if (!activeConversationId && !inputBlocked) {
        const title = messageContent.replace(/\s+/g, ' ').trim().slice(0, 72)
        const { data: created, error: createError } = await supabase
          .from('coach_conversations')
          .insert({ user_id: activeUserId, title })
          .select('*')
          .single()
        if (createError || !created) {
          // Conversation persistence was added after the original production
          // schema. Keep Coach available while that migration is pending.
          console.warn('[coach history] conversation persistence unavailable', createError?.code)
        } else {
          activeConversationId = created.id
          setConversationId(created.id)
          setConversations(prev => [created as CoachConversation, ...prev])
        }
      }

      if (activeConversationId) {
        const { error: userMessageError } = await supabase
          .from('coach_messages')
          .insert({
            conversation_id: activeConversationId,
            user_id: activeUserId,
            role: 'user',
            content: messageContent,
          })
        if (userMessageError) {
          console.warn('[coach history] user message was not saved', userMessageError.code)
        }
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let assistantContent = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        assistantContent += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            role: 'assistant',
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      }

      if (assistantContent.trim() && activeConversationId) {
        const { error: assistantMessageError } = await supabase
          .from('coach_messages')
          .insert({
            conversation_id: activeConversationId,
            user_id: activeUserId,
            role: 'assistant',
            content: assistantContent,
          })
        if (assistantMessageError) {
          setError('Your response is visible, but it could not be added to conversation history.')
        } else {
          const updatedAt = new Date().toISOString()
          await supabase
            .from('coach_conversations')
            .update({ updated_at: updatedAt })
            .eq('id', activeConversationId)
            .eq('user_id', activeUserId)
          setConversations(prev => prev
            .map(conversation => conversation.id === activeConversationId
              ? { ...conversation, updated_at: updatedAt }
              : conversation)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)))
        }
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : ''
      setError(message.includes('limit')
        ? `${message} You can continue when your allowance resets, or view Plus for higher limits.`
        : 'Clarity is unavailable right now. Please check your connection and try again.')
      setMessages(prev => prev.slice(0, -1)) // Remove empty assistant message
    } finally {
      setStreaming(false)
    }
  }

  async function openConversation(conversation: CoachConversation) {
    if (streaming || !userId) return
    setError('')
    const { data, error: loadError } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })

    if (loadError) {
      setError('Unable to load that conversation.')
      return
    }

    const savedMessages = (data ?? []) as SavedCoachMessage[]
    setMessages(savedMessages.map(({ role, content }) => ({ role, content })))
    setConversationId(conversation.id)
    setHistoryOpen(false)
  }

  function startNewConversation() {
    if (streaming) return
    setConversationId(null)
    setMessages([INITIAL_MESSAGE])
    setInput('')
    setError('')
    setHistoryOpen(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="adult-chat" style={{ background: "var(--cream)", display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '8px' }}>
          <button onClick={() => setHistoryOpen(value => !value)} disabled={streaming} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '100px', border: "1px solid var(--border)", background: historyOpen ? "var(--yellow-soft)" : "var(--surface)", color: historyOpen ? "var(--green)" : "var(--muted)", cursor: streaming ? 'default' : 'pointer', fontFamily: "var(--font-adult)", fontSize: "14px" }}>
            {historyOpen ? <X size={15} /> : <History size={15} />} History
          </button>
          <button onClick={startNewConversation} disabled={streaming} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '100px', border: "1px solid var(--yellow)", background: "var(--yellow-soft)", color: "var(--green)", cursor: streaming ? 'default' : 'pointer', fontFamily: "var(--font-adult)", fontSize: "14px" }}>
            <Plus size={15} /> New chat
          </button>
        </div>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '8px' }}>
          Clarity Coach
        </p>
        <h1>Clarity</h1>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: '12px' }}>
          AI-guided. Culturally aware. Always available.
        </p>
      </div>

      {historyOpen && (
        <aside style={{ margin: '0 16px 12px', padding: '14px', background: "var(--surface)", border: "1px solid var(--border)", borderRadius: '14px', maxHeight: '260px', overflowY: 'auto', flexShrink: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '10px' }}>
            Previous Conversations
          </p>
          {historyLoading ? (
            <p style={{ color: "var(--muted)", fontSize: "14px" }}>Loading history…</p>
          ) : conversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '18px 8px' }}>
              <MessageCircle size={22} color="var(--green)" style={{ marginBottom: '8px' }} />
              <p style={{ color: "var(--muted)", fontSize: "14px" }}>Your saved conversations will appear here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {conversations.map(conversation => (
                <button key={conversation.id} onClick={() => openConversation(conversation)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${conversation.id === conversationId ? 'var(--yellow)' : 'var(--border)'}`, background: conversation.id === conversationId ? "var(--yellow-soft)" : "var(--surface-soft)", color: "var(--ink)", cursor: 'pointer', fontFamily: "var(--font-adult)" }}>
                  <span style={{ display: 'block', fontSize: "16px", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conversation.title}</span>
                  <span style={{ display: 'block', fontSize: "13px", color: "var(--muted)", marginTop: '3px' }}>
                    {new Date(conversation.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </button>
              ))}
              {isCore && (
                <Link href="/upgrade" style={{ color: "var(--green)", fontSize: "14px", textAlign: 'center', padding: '8px', textDecoration: 'none' }}>
                  Core shows your {access.limits.coachConversationHistory} most recent conversations · See Plus
                </Link>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Messages area */}
      <div className="adult-chat-scroll" role="log" aria-label="Clarity conversation" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 8px' }}>

        {/* Coach intro */}
        <div style={{
          margin: '0 0 16px',
          background: "var(--green-soft)",
          border: "1px solid var(--border)",
          borderRadius: '16px', padding: '16px',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: "var(--green-soft)",
            border: "1px solid var(--border)",
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', flexShrink: 0,
          }}>🌿</div>
          <div>
            <p style={{ fontFamily: "var(--font-adult)", fontSize: "16px", color: "var(--ink)", fontStyle: 'italic', fontWeight: 400, lineHeight: 1.5 }}>
              {recentMood
                ? `I'm here to help you navigate whatever today brings. Your last check-in showed you're feeling ${recentMood} — let's work with that.`
                : "I'm here for the hard moments and the wins alike. Tell me what's on your mind."}
            </p>
            <p style={{ fontSize: "13px", color: "var(--green)", letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '8px' }}>
              Clarity · Your AI Coach
            </p>
          </div>
        </div>

        {/* Suggested prompts */}
        {!conversationId && messages.length <= 1 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '10px' }}>
              Suggested Prompts
            </p>
            {SUGGESTED_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p.text)}
                style={{
                  display: 'block', width: '100%',
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: '12px', padding: '13px 16px', marginBottom: '8px',
                  fontSize: "16px", color: "var(--ink)", cursor: 'pointer',
                  lineHeight: 1.4, textAlign: 'left',
                  fontFamily: "var(--font-adult)",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--green)", display: 'block', marginBottom: '3px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {p.prefix}
                </span>
                {p.text}
              </button>
            ))}
          </div>
        )}

        {/* Chat messages */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '8px' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                maxWidth: '82%',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                display: 'flex',
              }}
            >
              <div className="adult-chat-bubble" data-role={msg.role} style={{
                padding: '12px 15px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? "var(--yellow-soft)" : "var(--green-soft)",
                border: `1px solid ${msg.role === 'user' ? 'var(--yellow)' : 'var(--border)'}`,
                fontSize: "16px", color: "var(--ink)", lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === 'assistant' && msg.content === '' && (
                  <span style={{ opacity: 0.5 }}>Thinking…</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p style={{ fontSize: "14px", color: "var(--error)", padding: '10px 14px', background: "var(--error-soft)", borderRadius: '8px', marginBottom: '8px' }}>
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="adult-chat-composer" style={{
        padding: '12px 20px', background: "var(--cream)",
        borderTop: "1px solid var(--border)",
        display: 'flex', gap: '8px', alignItems: 'flex-end', flexShrink: 0,
      }}>
        <textarea
          aria-label="Message Clarity"
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something to Clarity…"
          rows={1}
          disabled={streaming}
          style={{
            flex: 1, background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: '20px',
            padding: '11px 16px', fontSize: "16px", color: "var(--ink)",
            outline: 'none', fontFamily: "var(--font-adult)",
            maxHeight: '120px', lineHeight: 1.4,
            opacity: streaming ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => sendMessage()}
          aria-label="Send message"
          disabled={!input.trim() || streaming}
          style={{
            width: '48px', height: '48px', borderRadius: '50%',
            background: input.trim() && !streaming ? "var(--orange)" : "var(--surface-soft)",
            border: 'none', cursor: input.trim() && !streaming ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: input.trim() && !streaming ? "var(--ink)" : "var(--muted)",
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
