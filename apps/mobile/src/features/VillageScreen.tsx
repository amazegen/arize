import { useCallback,useEffect,useRef,useState } from 'react'
import type { FormEvent } from 'react'
import type { Accounts } from '../account/client'
import type { NativeRoom,NativeMessage } from '../../../../lib/native/contracts'
import { MessageSafety,RoomSafety } from '../../../../components/village/SafetyTools'
import type { SafetyRequest } from '../../../../lib/village/safety'

export function VillageScreen({accounts,userId}:{accounts:Accounts;userId?:string}){
  const [rooms,setRooms]=useState<NativeRoom[]>([]),[selected,setSelected]=useState<NativeRoom|null>(null),[messages,setMessages]=useState<NativeMessage[]>([]),[before,setBefore]=useState<string|null>(null),[input,setInput]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState<{id:string;content:string;roomId:string}|null>(null)
  const [roomsStatus,setRoomsStatus]=useState<'loading'|'ready'|'error'>('loading'),[messagesStatus,setMessagesStatus]=useState<'loading'|'ready'|'error'>('loading')
  const alive=useRef(true),roomId=useRef<string|null>(null),bottom=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),nearBottom=useRef(true)
  const roomEpoch=useRef(0),loadSequence=useRef(0)
  useEffect(()=>{roomEpoch.current++;alive.current=true;let live=true;void accounts.request<{rooms:NativeRoom[]}>('/village').then(value=>{if(live){setRooms(value.rooms);setRoomsStatus('ready')}}).catch(error=>{if(live){setNotice(error.message);setRoomsStatus('error')}});return()=>{live=false;alive.current=false;roomId.current=null}},[accounts])
  const load=useCallback(async(id:string)=>{
    const epoch=roomEpoch.current,sequence=++loadSequence.current
    const current=()=>alive.current&&roomId.current===id&&roomEpoch.current===epoch&&loadSequence.current===sequence
    try{const data=await accounts.request<{messages:NativeMessage[];before:string|null}>(`/village?room=${id}`);if(current()){setMessages(data.messages);setBefore(data.before);setMessagesStatus('ready')}}
    catch(error){if(current())setMessagesStatus(status=>status==='ready'?'ready':'error');throw error}
  },[accounts])
  function openRoom(room:NativeRoom){roomEpoch.current++;roomId.current=room.id;setSelected(room);setMessages([]);setBefore(null);setMessagesStatus('loading');setRetry(null);setInput('');setNotice('');nearBottom.current=true}
  const safetyRpc=useCallback(async(request:SafetyRequest)=>accounts.request('/village','POST',{action:'safety',...request}),[accounts])
  function safetyChanged(){if(selected){setMessages([]);setBefore(null);setMessagesStatus('loading');void load(selected.id).catch(()=>setNotice('Refresh messages to check the latest room state.'))}}
  useEffect(()=>{
    if(!selected?.member)return
    let live=true;const id=selected.id
    void load(id).catch(error=>{if(live)setNotice(error.message)})
    let scheduled:ReturnType<typeof setTimeout>|undefined
    const channel=accounts.client.channel(`native-room:${id}:${crypto.randomUUID()}`).on('system',{},event=>{
      // Channel join can precede Postgres subscription readiness. Re-fetch after
      // the database acknowledgement to close that initial/reconnect gap.
      if(live&&event.extension==='postgres_changes'&&event.status==='ok')void load(id).then(()=>{if(live)setNotice('')}).catch(()=>{if(live)setNotice('Messages could not reconnect. Tap Refresh.')})
      if(live&&event.extension==='postgres_changes'&&event.status==='error')setNotice('Live updates are unavailable. You can still send text and tap Refresh messages.')
    }).on('postgres_changes',{event:'INSERT',schema:'public',table:'village_messages',filter:`room_id=eq.${id}`},()=>{clearTimeout(scheduled);scheduled=setTimeout(()=>{if(live)void load(id).catch(()=>{if(live)setNotice('Could not refresh messages. Tap Refresh when connected.')})},100)}).subscribe(status=>{if(live&&status==='SUBSCRIBED')void load(id).catch(()=>{if(live)setNotice('Messages could not reconnect. Tap Refresh.')});if(live&&['CHANNEL_ERROR','TIMED_OUT'].includes(status))setNotice('Live updates are unavailable. You can still send text and tap Refresh messages.')})
    const online=()=>{if(live&&!document.hidden)void load(id).catch(()=>undefined)};window.addEventListener('online',online);document.addEventListener('visibilitychange',online)
    // Moderation/block changes can remove rows without emitting a visible INSERT.
    const safetyPoll=setInterval(online,15000)
    return()=>{live=false;clearTimeout(scheduled);clearInterval(safetyPoll);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',online);void accounts.client.removeChannel(channel)}
  },[accounts,selected?.id,selected?.member,load])
  useEffect(()=>{const node=scroller.current;if(nearBottom.current&&node)node.scrollTo({top:node.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})},[messages])
  async function membership(room:NativeRoom,action:'join'|'leave'){setBusy(true);try{await accounts.request('/village','POST',{roomId:room.id,action});const updated={...room,member:action==='join'};if(alive.current){setRooms(current=>current.map(r=>r.id===room.id?updated:r));openRoom(updated)}}catch(error){if(alive.current)setNotice(error instanceof Error?error.message:'Membership not changed.')}finally{if(alive.current)setBusy(false)}}
  async function send(event?:FormEvent,again?:{id:string;content:string;roomId:string}){event?.preventDefault();if(!selected||busy||(!again&&!input.trim()))return;const turn=again??{id:crypto.randomUUID(),roomId:selected.id,content:input.trim()};setBusy(true);setRetry(null);nearBottom.current=true;if(!again)setInput('');try{await accounts.request('/village','POST',{...turn,action:'send'});await load(turn.roomId)}catch(error){if(alive.current&&roomId.current===turn.roomId){setRetry(turn);setNotice(error instanceof Error?error.message:'Message not confirmed. Retry the same message.')}}finally{if(alive.current)setBusy(false)}}
  async function older(){if(!selected||!before)return;const id=selected.id;setBusy(true);try{const data=await accounts.request<{messages:NativeMessage[];before:string|null}>(`/village?room=${id}&before=${encodeURIComponent(before)}`);if(alive.current&&roomId.current===id){nearBottom.current=false;setMessages(current=>[...data.messages,...current.filter(m=>!data.messages.some(old=>old.id===m.id))]);setBefore(data.before)}}catch(error){setNotice(error instanceof Error?error.message:'History not available.')}finally{setBusy(false)}}
  if(!selected)return <section><p className="eyebrow">YOUR VILLAGE</p><h1 tabIndex={-1}>Find your people.</h1><p className="intro">Real conversations. Text-only in this native build.</p><p role="status" className="notice">{notice}</p>{roomsStatus==='loading'?<p role="status">Loading rooms…</p>:roomsStatus==='error'?<p>Rooms could not load. Reopen Village to try again.</p>:rooms.length===0&&<p>Rooms will appear when available for your account.</p>}<div className="room-list">{rooms.map(room=><button className="room-card" key={room.id} onClick={()=>openRoom(room)}><h2>{room.name}</h2><p>{room.description}</p><span>{room.member?'Open room':'View room'} →</span></button>)}</div></section>
  return <section className="native-chat"><button className="text-button back" disabled={busy} onClick={()=>{roomEpoch.current++;roomId.current=null;setSelected(null);setMessages([]);setBefore(null);setRetry(null);setInput('');setNotice('')}}>← All rooms</button><div className="chat-top"><h1 tabIndex={-1}>{selected.name}</h1>{selected.member&&<button className="text-button" disabled={busy} onClick={()=>membership(selected,'leave')}>Leave room</button>}</div><p className="chat-disclaimer">Share thoughtfully. This is community support, not emergency care.</p>
    {!selected.member?<div className="settings-card"><p>{selected.description}</p><button className="primary" disabled={busy} onClick={()=>membership(selected,'join')}>Join room</button></div>:<>
      <RoomSafety key={selected.id} roomId={selected.id} rpc={safetyRpc} onChanged={safetyChanged}/>
      <div className="row-actions"><button className="text-button" disabled={busy} onClick={()=>{void load(selected.id).catch(error=>{if(alive.current&&roomId.current===selected.id)setNotice(error.message)})}}>Refresh messages</button>{before&&<button className="text-button" disabled={busy} onClick={older}>Earlier messages</button>}</div>
      <div className="conversation-scroll" ref={scroller} role="log" aria-label="Village messages" aria-busy={messagesStatus==='loading'} onScroll={()=>{const node=scroller.current;if(node)nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<100}}>
        {messagesStatus==='loading'?<p role="status">Loading messages…</p>:messagesStatus==='error'?<p>Messages could not load. Tap Refresh messages to try again.</p>:messages.length===0&&<p>No messages yet. Start a kind conversation.</p>}
        {messages.map(message=><div className="chat-message village" key={message.id}><span className="message-author">{message.name} · {new Date(message.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span><p>{message.content}</p>{message.user_id!==userId&&<MessageSafety roomId={selected.id} messageId={message.id} rpc={safetyRpc} onChanged={safetyChanged}/>}</div>)}<div ref={bottom}/>
      </div>
      {retry&&<button className="text-button" disabled={busy} onClick={()=>{void send(undefined,retry)}}>Retry this message</button>}
      <form className="chat-composer" onSubmit={send}><label className="sr-only" htmlFor="native-village-input">Message this room</label><textarea id="native-village-input" value={input} maxLength={4000} rows={2} placeholder="Say something kind…" onChange={e=>setInput(e.target.value)} disabled={busy}/><button className="primary" aria-label="Send to Village" disabled={busy||!input.trim()||!!retry}>↑</button></form>
    </>}
    <p role="status" className="notice">{notice}</p><p className="section-note">Audio/video recording and uploads are not enabled.</p>
  </section>
}
