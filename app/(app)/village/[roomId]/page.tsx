'use client'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Mic, MicOff, Video, VideoOff, Crown, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { VillageRoom, VillageMessage } from '@/lib/types'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import { useAccess } from '@/components/access/AccessProvider'
import { canAccessVillageRoom } from '@/lib/access/entitlements'
import { MessageSafety, RoomSafety } from '@/components/village/SafetyTools'
import { safetyError, type SafetyRequest } from '@/lib/village/safety'
import { villageMediaPath } from '@/lib/village/media'

const AVATAR_COLORS = ["var(--green-soft)", "var(--yellow-soft)", "var(--surface-soft)", '#e2eaf4', "var(--green-soft)", '#ffe5d4']

function getAvatarColor(userId: string) {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.roomId as string
  const supabase = createClient()
  const access = useAccess()
  const channelId = useId()

  const [room, setRoom] = useState<VillageRoom | null>(null)
  const [messages, setMessages] = useState<VillageMessage[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string | null } | null>(null)
  const [membershipRoomId, setMembershipRoomId] = useState<string | null>(null)
  const isMember = membershipRoomId === roomId
  const [roomNotice, setRoomNotice] = useState('')
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [videoRecording, setVideoRecording] = useState(false)
  const [videoRecordingSeconds, setVideoRecordingSeconds] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const videoRecorderRef = useRef<MediaRecorder | null>(null)
  const videoChunksRef = useRef<Blob[]>([])
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageLoadVersion=useRef(0)
  const invalidateMessages=useCallback(()=>{messageLoadVersion.current++},[])

  const loadMessages = useCallback(async () => {
    const version=++messageLoadVersion.current
    const { data, error } = await supabase
      .from('village_messages').select('*, profiles(name, username)')
      .eq('room_id', roomId).order('created_at', { ascending: true }).limit(100)
    if (error) { if(version===messageLoadVersion.current)setRoomNotice('Messages could not refresh. Please reopen the room.'); return }
    const safe=await Promise.all((data??[]).map(async(message:VillageMessage)=>{
      if(!message.audio_url)return message
      const path=villageMediaPath(message.audio_url,process.env.NEXT_PUBLIC_SUPABASE_URL!)
      if(!path)return {...message,audio_url:null}
      const signed=await supabase.storage.from('village-audio').createSignedUrl(path,60)
      return {...message,audio_url:signed.data?.signedUrl??null}
    }))
    if(version!==messageLoadVersion.current)return
    setMessages(safe)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [roomId, supabase])
  const safetyRpc=useCallback(async(args:SafetyRequest)=>{const result=await supabase.rpc('village_safety',args);if(result.error)throw result.error;return result.data},[supabase])
  const safetyChanged=useCallback(()=>{setMessages([]);void loadMessages()},[loadMessages])

  const loadModerators = useCallback(async () => {
    const { data } = await supabase.rpc('get_village_moderator_ids', { target_room_id: roomId })
    if (data) setModeratorIds(new Set(data))
  }, [roomId, supabase])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { router.push('/sign-in'); return }

      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      if (cancelled) return
      setCurrentUser({ id: user.id, name: profile?.name ?? null })

      const { data: roomData } = await supabase.from('village_rooms').select('*').eq('id', roomId).single()
      if (cancelled) return
      setRoom(roomData)

      if (roomData && !canAccessVillageRoom(access, roomData.name)) {
        setLoading(false)
        return
      }

      const { data: membership } = await supabase
        .from('village_memberships').select('user_id, is_moderator')
        .eq('user_id', user.id).eq('room_id', roomId).single()

      if (cancelled) return
      setMembershipRoomId(membership ? roomId : null)
      if (membership) {
        await loadMessages()
        await loadModerators()
      }

      if (!cancelled) setLoading(false)
    }
    init()
    return () => {
      cancelled = true
      invalidateMessages()
      if (timerRef.current) clearInterval(timerRef.current)
      if (videoTimerRef.current) clearInterval(videoTimerRef.current)
    }
  }, [roomId, supabase, router, access, loadMessages, loadModerators, invalidateMessages])

  const canReadRoom = !!room && room.id === roomId && canAccessVillageRoom(access, room.name)
  useEffect(() => {
    if (!isMember || !canReadRoom) return
    let active = true
    // Per-mount identity avoids reusing an unsubscribing channel on a quick revisit.
    const channel = supabase.channel(`room:${roomId}:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'village_messages', filter: `room_id=eq.${roomId}` },
        async (payload: RealtimePostgresInsertPayload<{ id: string }>) => {
          if (active && payload.new.id) await loadMessages()
        })
      .subscribe()
    const refreshSafety=()=>{if(active&&!document.hidden)void loadMessages()}
    const safetyPoll=setInterval(refreshSafety,15000)
    document.addEventListener('visibilitychange',refreshSafety)
    return () => { active = false; clearInterval(safetyPoll);document.removeEventListener('visibilitychange',refreshSafety);void supabase.removeChannel(channel) }
  }, [isMember, canReadRoom, roomId, channelId, supabase, loadMessages])

  async function joinRoom() {
    if (!currentUser) return
    const { data: isFirst, error } = await supabase.rpc('join_village_room', { target_room_id: roomId })
    if (error) {
      setRoomNotice('Unable to join this room. Please check your access and try again.')
      return
    }
    setMembershipRoomId(roomId)
    if (isFirst) setModeratorIds(new Set([currentUser.id]))
    await loadMessages()
    await loadModerators()
  }

  async function sendMessage() {
    if (!text.trim() || !currentUser || sending) return
    setSending(true)
    const content = text.trim()
    const {error}=await supabase.from('village_messages').insert({ room_id: roomId, user_id: currentUser.id, content, message_type: 'text' })
    if(error)setRoomNotice(safetyError(error))
    else {setText('');setRoomNotice('');await loadMessages()}
    setSending(false)
  }

  async function startRecording() {
    if (!access.limits.villageMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (audioChunksRef.current.length === 0 || !currentUser) return
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const fileName = `${currentUser.id}/${roomId}/${Date.now()}.webm`
        const { error: uploadError } = await supabase.storage.from('village-audio').upload(fileName, blob, { contentType: 'audio/webm' })
        if (uploadError) { setRoomNotice('Audio upload could not be confirmed.'); return }
        const result=await supabase.from('village_messages').insert({
          room_id: roomId, user_id: currentUser.id,
          content: '🎤 Voice message', message_type: 'audio', audio_url: fileName,
        })
        if(result.error)setRoomNotice(safetyError(result.error));else await loadMessages()
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch {
      setRoomNotice('Microphone is unavailable or permission was declined.')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setRecording(false)
    setRecordingSeconds(0)
  }

  async function startVideoRecording() {
    if (!access.limits.villageMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        videoPreviewRef.current.play()
      }
      videoChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null
        if (videoChunksRef.current.length === 0 || !currentUser) return
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
        const blob = new Blob(videoChunksRef.current, { type: mimeType })
        const fileName = `${currentUser.id}/${roomId}/video-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('village-audio').upload(fileName, blob, { contentType: mimeType })
        if (uploadError) { setRoomNotice('Video upload could not be confirmed.'); return }
        const result=await supabase.from('village_messages').insert({
          room_id: roomId, user_id: currentUser.id,
          content: '🎥 Video message', message_type: 'video', audio_url: fileName,
        })
        if(result.error)setRoomNotice(safetyError(result.error));else await loadMessages()
      }
      recorder.start()
      videoRecorderRef.current = recorder
      setVideoRecording(true)
      setVideoRecordingSeconds(0)
      videoTimerRef.current = setInterval(() => {
        setVideoRecordingSeconds(s => {
          if (s + 1 >= 60) { stopVideoRecording(); return 0 }
          return s + 1
        })
      }, 1000)
    } catch {
      setRoomNotice('Camera is unavailable or permission was declined.')
    }
  }

  function stopVideoRecording() {
    if (videoTimerRef.current) clearInterval(videoTimerRef.current)
    videoRecorderRef.current?.stop()
    setVideoRecording(false)
    setVideoRecordingSeconds(0)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (loading) {
    return (
      <div style={{ background: "var(--cream)", minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: "var(--muted)", fontSize: "16px" }}>Loading room…</p>
      </div>
    )
  }

  if (room && !canAccessVillageRoom(access, room.name)) {
    return (
      <div style={{ background: "var(--cream)", minHeight: '100%', padding: "18px 20px" }}>
        <Link href="/village" style={{ color: "var(--muted)", display: 'inline-flex', alignItems: 'center', gap: '7px', textDecoration: 'none', fontSize: "16px" }}>
          <ArrowLeft size={18} /> Back to Village
        </Link>
        <div style={{ maxWidth: '340px', margin: '72px auto 0', textAlign: 'center', padding: '28px 22px', borderRadius: '20px', background: "var(--surface)", border: "1px solid var(--yellow)" }}>
          <div style={{ width: '52px', height: '52px', display: 'grid', placeItems: 'center', margin: '0 auto 16px', borderRadius: '16px', background: "var(--yellow-soft)", color: "var(--green)" }}>
            <LockKeyhole size={24} />
          </div>
          <h1 style={{ fontFamily: "var(--font-adult)", fontSize: '23px', color: "var(--ink)", fontWeight: 500, marginBottom: '10px' }}>{room.name} is a Plus room</h1>
          <p style={{ color: "var(--muted)", fontSize: "16px", lineHeight: 1.55, marginBottom: '20px' }}>Core members can join Wins Only with text chat. Plus opens every room along with voice and video messages.</p>
          <Link href="/upgrade" style={{ display: 'block', padding: '13px', borderRadius: '12px', background: "var(--orange)", color: "var(--ink)", fontWeight: 700, textDecoration: 'none' }}>See Arize Plus</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="adult-chat" style={{ background: "var(--cream)", display: 'flex', flexDirection: 'column' }}>

      {/* Room header */}
      <div style={{ padding: '12px 16px', background: "var(--green-soft)", borderBottom: "1px solid var(--border)", display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <Link href="/village" aria-label="Back to Village rooms" style={{ color: "var(--muted)", display: 'flex', alignItems: 'center', minWidth: 44, minHeight: 44 }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: "var(--font-adult)", fontSize: '16px', color: "var(--ink)", fontWeight: 400, lineHeight: 1.2 }}>
            {room?.name ?? 'Room'}
          </p>
          <p style={{ fontSize: "14px", color: "var(--muted)" }}>{room?.description}</p>
        </div>
        {moderatorIds.has(currentUser?.id??'') && (
          <span style={{ fontSize: "13px", color: "var(--green)", background: "var(--yellow-soft)", padding: '3px 8px', borderRadius: '100px', border: "1px solid var(--yellow)", display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Crown size={10} /> Mod
          </span>
        )}
      </div>

      {!isMember ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "40px 20px", textAlign: 'center' }}>
          <p style={{ fontSize: '18px', marginBottom: '16px' }}>💬</p>
          <h3 style={{ fontFamily: "var(--font-adult)", fontSize: '20px', color: "var(--ink)", fontWeight: 400, marginBottom: '12px' }}>
            Join {room?.name}
          </h3>
          <p style={{ fontSize: "16px", color: "var(--muted)", lineHeight: 1.5, marginBottom: "20px", maxWidth: '280px' }}>
            {room?.description} Join to read and participate in the conversation.
          </p>
          <button onClick={joinRoom}
            style={{ background: "var(--orange)", color: "var(--ink)", border: 'none', padding: '13px 28px', borderRadius: '100px', fontSize: "16px", fontWeight: 600, cursor: 'pointer', fontFamily: "var(--font-adult)" }}>
            Join this room
          </button>
        </div>
      ) : (
        <>
          <div style={{padding:'0 20px'}}><RoomSafety key={roomId} roomId={roomId} rpc={safetyRpc} onChanged={safetyChanged}/><p role="status">{roomNotice}</p></div>
          {/* Messages */}
          <div className="adult-chat-scroll" role="log" aria-label="Village conversation" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ fontSize: "16px", color: "var(--muted)", lineHeight: 1.5 }}>
                  Be the first to say something in {room?.name}.
                </p>
              </div>
            )}
            {messages.map(msg => {
              const isOwn = msg.user_id === currentUser?.id
              const profile = msg.profiles as { name: string | null; username: string | null } | null
              const name = profile?.username ? `@${profile.username}` : (profile?.name ?? 'Member')
              const isMsgModerator = moderatorIds.has(msg.user_id)
              return (
                <div key={msg.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexDirection: isOwn ? 'row-reverse' : 'row' }}>
                  {!isOwn && (
                    <button
                      title={isMsgModerator ? 'Assigned moderator' : 'Village member'}
                      style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: getAvatarColor(msg.user_id),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: "13px", fontWeight: 600, color: 'var(--ink)', flexShrink: 0,
                        border: isMsgModerator ? "2px solid var(--green)" : '2px solid transparent',
                        cursor: 'default',
                        padding: 0,
                      }}>
                      {getInitials(name)}
                    </button>
                  )}
                  <div style={{ maxWidth: '88%' }}>
                    {!isOwn && (
                      <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: '3px', marginLeft: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {name}
                        {isMsgModerator && <Crown size={9} color="var(--green)" />}
                      </p>
                    )}
                    <div className="adult-chat-bubble" data-role={isOwn ? 'user' : 'assistant'} style={{
                      padding: (msg.message_type === 'audio' || msg.message_type === 'video') ? '6px 8px' : '9px 12px',
                      borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isOwn ? "var(--yellow-soft)" : "var(--green-soft)",
                      border: `1px solid ${isOwn ? 'var(--yellow)' : 'var(--border)'}`,
                      fontSize: '15px', color: "var(--ink)", lineHeight: 1.45,
                    }}>
                      {msg.message_type === 'audio' && msg.audio_url ? (
                        <audio controls src={msg.audio_url} style={{ height: '32px', maxWidth: '200px', display: 'block' }} />
                      ) : msg.message_type === 'video' && msg.audio_url ? (
                        <video controls src={msg.audio_url} style={{ maxWidth: '220px', maxHeight: '160px', borderRadius: '8px', display: 'block' }} />
                      ) : (
                        msg.content
                      )}
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: '3px', textAlign: isOwn ? 'right' : 'left', marginRight: isOwn ? '4px' : 0, marginLeft: isOwn ? 0 : '4px' }}>
                      {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                    {!isOwn&&<MessageSafety roomId={roomId} messageId={msg.id} rpc={safetyRpc} onChanged={safetyChanged}/>}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="adult-chat-composer" style={{ padding: '12px 16px', flexShrink: 0 }}>
            {videoRecording ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <video ref={videoPreviewRef} muted playsInline style={{ width: '100%', maxHeight: '180px', borderRadius: '12px', objectFit: 'cover', background: '#000' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: "var(--error-soft)", border: "1px solid var(--error)", borderRadius: '20px', padding: '10px 16px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: "var(--error)", display: 'inline-block' }} />
                    <span style={{ fontSize: "16px", color: "var(--error)" }}>Recording {formatTime(videoRecordingSeconds)} / 1:00</span>
                  </div>
                  <button onClick={stopVideoRecording} aria-label="Stop video recording"
                    style={{ width: '40px', height: '40px', borderRadius: '50%', background: "var(--error)", border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                    <VideoOff size={16} />
                  </button>
                </div>
              </div>
            ) : recording ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: "var(--error-soft)", border: "1px solid var(--error)", borderRadius: '20px', padding: '10px 16px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: "var(--error)", display: 'inline-block' }} />
                  <span style={{ fontSize: "16px", color: "var(--error)" }}>Recording {formatTime(recordingSeconds)}</span>
                </div>
                <button onClick={stopRecording} aria-label="Stop voice recording"
                  style={{ width: '40px', height: '40px', borderRadius: '50%', background: "var(--error)", border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                  <MicOff size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {access.limits.villageMedia ? <><button onClick={startRecording} aria-label="Record voice message"
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: "var(--surface-soft)", border: "1px solid var(--border)", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: "var(--muted)", flexShrink: 0 }}>
                  <Mic size={15} />
                </button>
                <button onClick={startVideoRecording} aria-label="Record video message"
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: "var(--surface-soft)", border: "1px solid var(--border)", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: "var(--muted)", flexShrink: 0 }}>
                  <Video size={15} />
                </button></> : (
                  <Link href="/upgrade" aria-label="Unlock voice and video with Plus" title="Voice and video are available with Plus" style={{ width: '44px', height: '44px', borderRadius: '50%', background: "var(--yellow-soft)", border: "1px solid var(--yellow)", display: 'flex', alignItems: 'center', justifyContent: 'center', color: "var(--green)", flexShrink: 0 }}>
                    <LockKeyhole size={15} />
                  </Link>
                )}
                <textarea
                  aria-label="Message the Village room"
                  value={text}
                  maxLength={4000}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Say something…"
                  rows={1}
                  style={{
                    flex: 1, minWidth: 0, background: "var(--surface-soft)",
                    border: "1px solid var(--border)", borderRadius: '20px',
                    padding: '10px 16px', fontSize: "16px", color: "var(--ink)",
                    outline: 'none', fontFamily: "var(--font-adult)", maxHeight: '100px', lineHeight: 1.4,
                  }}
                />
                <button onClick={sendMessage} disabled={!text.trim() || sending} aria-label="Send message"
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: text.trim() ? "var(--orange)" : "var(--surface-soft)",
                    border: 'none', cursor: text.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color: text.trim() ? "var(--ink)" : "var(--muted)",
                  }}>
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
