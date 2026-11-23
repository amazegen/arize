import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Accounts } from '../account/client'
import { NATIVE_AI_DISCLOSURE, type NativeConversation, type NativeChatMessage } from '../../../../lib/native/contracts'

type Turn = { id: string; conversationId: string; message: string }
type History = { conversations: NativeConversation[]; before: string | null }
type Messages = { messages: NativeChatMessage[]; before: string | null }

export function ClarityScreen({ accounts, aiConsented, onRefresh }: { accounts: Accounts; aiConsented: boolean; onRefresh: () => Promise<void> }) {
  const [history, setHistory] = useState<NativeConversation[]>([])
  const [messages, setMessages] = useState<NativeChatMessage[]>([])
  const [conversation, setConversation] = useState<string>(() => crypto.randomUUID())
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [sending, setSending] = useState(false)
  const [notice, setNotice] = useState(''), [showHistory, setShowHistory] = useState(false), [consented, setConsented] = useState(false)
  const [retry, setRetry] = useState<Turn | null>(null)
  const [historyBefore, setHistoryBefore] = useState<string | null>(null), [messageBefore, setMessageBefore] = useState<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null), alive = useRef(true), selection = useRef(0), nearBottom = useRef(true)
  const restoreScroll = useRef<{ height: number; top: number } | null>(null), historyRevision = useRef(0)

  const refreshHistory = useCallback(async () => {
    const revision = ++historyRevision.current
    const value = await accounts.request<History>('/coach')
    if (alive.current && revision === historyRevision.current) { setHistory(value.conversations); setHistoryBefore(value.before) }
  }, [accounts])
  useEffect(() => {
    alive.current = true
    void refreshHistory().catch(error => { if (alive.current) setNotice(error.message) })
    return () => { alive.current = false }
  }, [refreshHistory])
  useLayoutEffect(() => {
    const node = scroll.current, previous = restoreScroll.current
    if (node && previous) { node.scrollTop = previous.top + node.scrollHeight - previous.height; restoreScroll.current = null }
  }, [messages])
  useEffect(() => {
    const node = scroll.current
    if (nearBottom.current && node) {
      const far = node.scrollHeight - node.scrollTop - node.clientHeight > node.clientHeight
      node.scrollTo({ top: node.scrollHeight, behavior: far || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }, [messages, sending])

  async function moreHistory() {
    if (!historyBefore || busy) return
    setBusy(true)
    try {
      const value = await accounts.request<History>(`/coach?before=${encodeURIComponent(historyBefore)}`)
      if (alive.current) { setHistory(current => [...current, ...value.conversations.filter(item => !current.some(old => old.id === item.id))]); setHistoryBefore(value.before) }
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : 'Earlier chats unavailable.') }
    finally { if (alive.current) setBusy(false) }
  }
  async function toggleHistory() {
    if (showHistory) { setShowHistory(false); return }
    setShowHistory(true); setBusy(true)
    try { await refreshHistory() }
    catch { if (alive.current) setNotice('Saved chats could not refresh. Close and reopen History when connected.') }
    finally { if (alive.current) setBusy(false) }
  }
  async function open(saved: NativeConversation) {
    if (busy) return
    const ticket = ++selection.current
    setBusy(true); setNotice('')
    try {
      const value = await accounts.request<Messages>(`/coach?conversation=${saved.id}`)
      if (alive.current && ticket === selection.current) {
        restoreScroll.current = null; nearBottom.current = true
        setConversation(saved.id); setMessages(value.messages); setMessageBefore(value.before)
        setRetry(null); setInput(''); setShowHistory(false)
      }
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : 'History unavailable.') }
    finally { if (alive.current) setBusy(false) }
  }
  async function moreMessages() {
    if (!messageBefore || busy) return
    const ticket = selection.current
    setBusy(true); setNotice('')
    try {
      const value = await accounts.request<Messages>(`/coach?conversation=${conversation}&before=${encodeURIComponent(messageBefore)}`)
      if (alive.current && ticket === selection.current) {
        const node = scroll.current
        restoreScroll.current = node ? { top: node.scrollTop, height: node.scrollHeight } : null
        nearBottom.current = false
        setMessages(current => [...value.messages, ...current.filter(message => !message.id || !value.messages.some(older => older.id === message.id))])
        setMessageBefore(value.before)
      }
    } catch (error) { if (alive.current && ticket === selection.current) setNotice(error instanceof Error ? error.message : 'Earlier messages unavailable.') }
    finally { if (alive.current && ticket === selection.current) setBusy(false) }
  }
  function fresh() {
    if (busy) return
    selection.current++; restoreScroll.current = null; nearBottom.current = true
    setConversation(crypto.randomUUID()); setMessages([]); setMessageBefore(null); setRetry(null); setNotice(''); setInput(''); setShowHistory(false)
  }
  async function send(event?: FormEvent, again?: Turn) {
    event?.preventDefault()
    if (busy || (!again && !input.trim())) return
    const turn = again ?? { id: crypto.randomUUID(), conversationId: conversation, message: input.trim() }
    const ticket = selection.current
    setBusy(true); setSending(true); setNotice(''); setRetry(null); nearBottom.current = true; restoreScroll.current = null
    if (!again) { setMessages(current => [...current, { id: turn.id, role: 'user', content: turn.message }]); setInput('') }
    try {
      const value = await accounts.request<{ reply: string; blocked: boolean; conversationId: string | null }>('/coach', 'POST', { requestId: turn.id, conversationId: turn.conversationId, message: turn.message })
      if (!alive.current || ticket !== selection.current) return
      setMessages(current => [...current, { id: `${turn.id}-reply`, role: 'assistant', content: value.reply }])
      if (value.blocked) setNotice('This safety response is not saved as a coaching conversation. No one has been notified.')
      else void refreshHistory().catch(() => { if (alive.current && ticket === selection.current) setNotice('Your reply was saved, but the history list could not refresh. Reopen History when connected.') })
    } catch (error) {
      if (alive.current && ticket === selection.current) { setRetry(turn); setNotice(error instanceof Error ? error.message : 'Clarity could not finish. Retry the same turn when connected.') }
    } finally { if (alive.current && ticket === selection.current) { setBusy(false); setSending(false) } }
  }
  async function accept() {
    setBusy(true)
    try { await accounts.request('/ai-consent', 'POST', { accepted: true, version: NATIVE_AI_DISCLOSURE }); await onRefresh() }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Disclosure not saved.') }
    finally { setBusy(false) }
  }
  if (!aiConsented) return <section><p className="eyebrow">CLARITY · AI COACH</p><h1 tabIndex={-1}>Before we chat.</h1><section className="settings-card account-form"><h2>Your choice, your information</h2><p>Clarity is AI, not a therapist or live counselor. Your messages, recent check-in and active goals are sent through Arize’s adult server to OpenAI to generate a response. Safety-checked conversations are saved in your adult Arize account so you can return to them.</p><p>Nobody watches this chat live. Sending a message does not notify a counselor or emergency service.</p><label className="check-row"><input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} /><span>I understand and choose to use Clarity with this data processing.</span></label><button className="primary full" disabled={!consented || busy} onClick={accept}>Continue to Clarity</button><p role="status">{notice}</p></section></section>
  return <section className="native-chat">
    <div className="chat-top"><div><p className="eyebrow">CLARITY · AI COACH</p><h1 tabIndex={-1}>Talk it through.</h1></div><div className="row-actions"><button className="secondary" disabled={busy} onClick={toggleHistory}>History</button><button className="secondary" disabled={busy} onClick={fresh}>New chat</button></div></div>
    {showHistory && <section className="history-panel" aria-label="Saved Clarity chats"><h2>Saved chats</h2>{history.length === 0 ? <p>No saved conversations yet.</p> : history.map(item => <button key={item.id} className="history-item" aria-pressed={conversation === item.id} onClick={() => open(item)} disabled={busy}>{item.title}<span>{new Date(item.updated_at).toLocaleDateString()}</span></button>)}{historyBefore && <button className="text-button" disabled={busy} onClick={moreHistory}>Earlier saved chats</button>}</section>}
    <p className="chat-disclaimer">AI support, not therapy. Not monitored live.</p>
    <div className="conversation-scroll" ref={scroll} role="log" aria-label="Clarity conversation" onScroll={() => { const node = scroll.current; if (node) nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100 }}>
      {messageBefore && <button className="text-button" disabled={busy} onClick={moreMessages}>Load earlier messages</button>}
      {messages.length === 0 && <div className="chat-welcome"><h2>Start where you are.</h2><p>Want to prepare for a hard conversation, process your day or choose one next step?</p></div>}
      {messages.map((message, index) => <div key={message.id ?? index} className={`chat-message ${message.role}`}><span className="message-author">{message.role === 'user' ? 'You' : 'Clarity · AI'}</span><p>{message.content}</p></div>)}
      {sending && <p role="status" className="chat-thinking">Clarity is checking and preparing a response…</p>}
    </div>
    {notice && <p className="notice" role="status">{notice}</p>}{retry && <button className="text-button" disabled={busy} onClick={() => { void send(undefined, retry) }}>Retry this turn</button>}
    <form className="chat-composer" onSubmit={send}><label className="sr-only" htmlFor="native-clarity-input">Message Clarity</label><textarea id="native-clarity-input" value={input} maxLength={4000} rows={2} placeholder="What’s on your mind?" disabled={busy} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} /><button className="primary" aria-label="Send to Clarity" disabled={busy || !input.trim() || !!retry}>↑</button></form>
  </section>
}
