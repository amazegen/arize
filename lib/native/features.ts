import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import type { nativeSession } from './server'
import { checked, NativeError, nativeAdmin } from './server'
import { CATEGORIES, goalDraft, UUID, validDate } from './contracts'
import { cursor, messageCursor } from './policy'
import { canAccessVillageRoom } from '../access/entitlements'
import { validateCoachRequest } from '../coach/request'
import { generateAdultReply } from '../clarity/adult-generation'
import { validSafetyRequest } from '../village/safety'

type Session = Awaited<ReturnType<typeof nativeSession>>
const goalFields='id,title,category,deadline,week_of,notes,is_complete,progress'
function id(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value)) throw new NativeError('input','Invalid record.');return value }
function only(body: Record<string,unknown>, fields: string[]) { if (Object.keys(body).some(k=>!fields.includes(k))) throw new NativeError('input','Unexpected fields.') }
function pageCursor(value: string|null) {try{return cursor(value)}catch{throw new NativeError('input','This history cursor is invalid. Reopen the list.')}}
function pageMessageCursor(value: string|null) {try{return messageCursor(value)}catch{throw new NativeError('input','This message cursor is invalid. Reopen the conversation.')}}
export async function nativeGoals(s: Session, method: string, url: URL, body: Record<string,unknown>) {
  const db=s.supabase,u=s.user.id
  if (method==='GET') {
    const week=url.searchParams.get('week')
    if (!validDate(week) || new Date(`${week}T12:00Z`).getUTCDay()!==0) throw new NativeError('input','Choose a valid week.')
    const end=new Date(`${week}T12:00Z`);end.setUTCDate(end.getUTCDate()+7)
    const goals=checked(await db.from('goals').select(goalFields).eq('user_id',u).gte('week_of',week).lt('week_of',end.toISOString().slice(0,10)).order('created_at').limit(200))
    return {goals}
  }
  const goalId=id(body.id)
  if (method==='POST') {
    const draft=goalDraft(body);if (!draft) throw new NativeError('input','Check your goal title, category, date and notes.')
    const inserted=await db.from('goals').insert({...draft,user_id:u,is_complete:false,progress:0}).select(goalFields).single()
    if (inserted.error?.code==='23505') {
      const existing=checked(await db.from('goals').select(goalFields).eq('id',goalId).eq('user_id',u).maybeSingle())
      if (existing && (['title','category','deadline','week_of','notes'] as const).every(k=>existing[k]===draft[k])) return {goal:existing}
      throw new NativeError('conflict','This goal request has already been used. Refresh and try again.',409)
    }
    return {goal:checked(inserted)}
  }
  const existing=checked(await db.from('goals').select(goalFields).eq('id',goalId).eq('user_id',u).maybeSingle())
  if (!existing) throw new NativeError('not_found','Goal not found.',404)
  if (method==='DELETE') {only(body,['id']);checked(await db.from('goals').delete().eq('id',goalId).eq('user_id',u));return {deleted:true} }
  if (method==='PATCH') {
    let changes: Record<string,unknown>
    if ('is_complete' in body) {
      only(body,['id','is_complete']);if (typeof body.is_complete!=='boolean') throw new NativeError('input','Choose a completion state.')
      changes={is_complete:body.is_complete,progress:body.is_complete?100:existing.progress}
    } else { const draft=goalDraft(body);if (!draft) throw new NativeError('input','Check the goal fields.');changes=draft }
    const goal=checked(await db.from('goals').update(changes).eq('id',goalId).eq('user_id',u).select(goalFields).maybeSingle())
    if (!goal) throw new NativeError('storage','The goal was not changed.',409)
    return {goal}
  }
  throw new NativeError('method','Method not allowed.',405)
}

async function room(s: Session, roomId: string, member = true) {
  const data=checked(await s.supabase.from('village_rooms').select('id,name,description').eq('id',roomId).maybeSingle())
  if (!data || !canAccessVillageRoom(s.access,data.name)) throw new NativeError('not_found','Room not available.',404)
  const membership=checked(await s.supabase.from('village_memberships').select('is_moderator').eq('user_id',s.user.id).eq('room_id',roomId).maybeSingle())
  if (member && !membership) throw new NativeError('membership','Join this room to view its messages.',403)
  return {data,membership}
}
export async function nativeVillage(s: Session, method: string, url: URL, body: Record<string,unknown>) {
  const db=s.supabase,u=s.user.id
  if(method==='POST'&&body.action==='safety'){
    const args={...body};delete args.action
    if(!validSafetyRequest(args))throw new NativeError('input','Choose a valid Village safety action.')
    const result=await db.rpc('village_safety',args)
    if(result.error)throw new NativeError(result.error.code==='P0001'?'rate_limit':'safety',result.error.code==='P0001'?'Please wait before trying again. A room or account limit applies.':'This safety action is unavailable or could not be confirmed.',result.error.code==='P0001'?429:403)
    return result.data
  }
  if (method==='GET' && !url.searchParams.has('room')) {
    const [rooms,memberships]=await Promise.all([db.from('village_rooms').select('id,name,description').order('name').limit(100),db.from('village_memberships').select('room_id,is_moderator').eq('user_id',u).limit(100)])
    const mine=checked(memberships) ?? []
    return {rooms:(checked(rooms) ?? []).filter(r=>canAccessVillageRoom(s.access,r.name)).map(r=>({ ...r,member:mine.some(m=>m.room_id===r.id),moderator:false }))}
  }
  const roomId=id(method==='GET'?url.searchParams.get('room'):body.roomId)
  if (method==='GET') {
    await room(s,roomId)
    const before=pageCursor(url.searchParams.get('before'))
    let query=db.from('village_messages').select('id,user_id,content,created_at,message_type,profiles(name,username)').eq('room_id',roomId)
    if (before) query=query.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`)
    const rows=checked(await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50)) ?? []
    const last=rows.at(-1)
    return {messages:rows.reverse().map(m=>({id:m.id,user_id:m.user_id,content:m.message_type==='text'?m.content:'Media message — not available in this text-only build.',created_at:m.created_at,message_type:m.message_type,name:(Array.isArray(m.profiles)?m.profiles[0]:m.profiles)?.name || 'Village member'})),before:rows.length===50 && last?Buffer.from(JSON.stringify({at:last.created_at,id:last.id})).toString('base64url'):null}
  }
  if (method!=='POST') throw new NativeError('method','Method not allowed.',405)
  if (body.action==='join' || body.action==='leave') {
    only(body,['roomId','action']);await room(s,roomId,false)
    if (body.action==='join') checked(await db.rpc('join_village_room',{target_room_id:roomId}))
    else checked(await db.from('village_memberships').delete().eq('room_id',roomId).eq('user_id',u))
    return {saved:true}
  }
  only(body,['roomId','action','id','content']);await room(s,roomId)
  if (body.action!=='send' || typeof body.content!=='string' || !body.content.trim() || body.content.length>4000) throw new NativeError('input','Enter a text message of up to 4,000 characters.')
  const messageId=id(body.id), content=body.content.trim()
  const result=await db.from('village_messages').insert({id:messageId,room_id:roomId,user_id:u,content,message_type:'text'}).select('id').single()
  if(result.error?.code==='P0001')throw new NativeError('rate_limit','Please wait before sending again. Posting may be paused or a message limit reached.',429)
  if (result.error?.code==='23505') {
    const old=checked(await db.from('village_messages').select('id,content,user_id,room_id').eq('id',messageId).maybeSingle())
    if (old?.user_id===u && old.room_id===roomId && old.content===content) return {id:messageId}
    throw new NativeError('conflict','This message request was already used.',409)
  }
  return checked(result)
}

export async function nativeCoach(s: Session, method: string, url: URL, body: Record<string,unknown>) {
  const db=s.supabase,u=s.user.id
  if (method==='GET') {
    const conversationId=url.searchParams.get('conversation')
    if (!conversationId) {
      const before=pageCursor(url.searchParams.get('before'))
      let query=db.from('coach_conversations').select('id,title,updated_at').eq('user_id',u)
      if(before)query=query.or(`updated_at.lt.${before.at},and(updated_at.eq.${before.at},id.lt.${before.id})`)
      const conversations=checked(await query.order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(s.access.limits.coachConversationHistory ?? 50)) ?? []
      const last=conversations.at(-1)
      return {conversations,before:conversations.length===50&&last?Buffer.from(JSON.stringify({at:last.updated_at,id:last.id})).toString('base64url'):null}
    }
    const conversation=checked(await db.from('coach_conversations').select('id,title').eq('id',id(conversationId)).eq('user_id',u).maybeSingle())
    if (!conversation) throw new NativeError('not_found','Conversation not available.',404)
    const before=pageMessageCursor(url.searchParams.get('before'))
    let query=db.from('coach_messages').select('id::text,role,content,created_at').eq('conversation_id',conversationId).eq('user_id',u)
    if(before)query=query.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`)
    const rows=checked(await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(201)) ?? []
    const messages=rows.slice(0,200),oldest=messages.at(-1)
    return {conversation,messages:messages.reverse(),before:rows.length>200&&oldest?Buffer.from(JSON.stringify({at:oldest.created_at,id:oldest.id})).toString('base64url'):null}
  }
  if (method!=='POST') throw new NativeError('method','Method not allowed.',405)
  if (!s.context.aiConsented) throw new NativeError('ai_consent','Review and accept the AI sharing disclosure first.',403)
  only(body,['requestId','conversationId','message'])
  const requestId=id(body.requestId),conversationId=id(body.conversationId)
  if (typeof body.message!=='string' || !body.message.trim() || body.message.length>4000) throw new NativeError('input','Enter a message of up to 4,000 characters.')
  const admin=nativeAdmin()
  const owner=checked(await admin.from('coach_conversations').select('user_id').eq('id',conversationId).maybeSingle())
  if (owner) {
    const visible=checked(await db.from('coach_conversations').select('id').eq('id',conversationId).eq('user_id',u).maybeSingle())
    if (owner.user_id!==u || !visible) throw new NativeError('not_found','Conversation not available.',404)
  }
  const hash=createHash('sha256').update(JSON.stringify({conversationId,message:body.message.trim()})).digest('hex')
  const claim=checked(await admin.rpc('native_claim_turn',{p_user:u,p_session:s.context.sessionId,p_request:requestId,p_conversation:conversationId,p_hash:hash}))
  if (!claim || claim.error) throw new NativeError('retry','This turn is still finishing, changed, or reached its retry limit. Try again shortly.',409)
  if (typeof claim.reply==='string') return {reply:claim.reply,blocked:claim.blocked,conversationId:claim.conversationId}
  if (!UUID.test(claim.token ?? '')) throw new NativeError('storage','Conversation service unavailable.',503)
  const finish=(input:string|null,reply:string|null,blocked:boolean)=>admin.rpc('native_finish_turn',{p_user:u,p_session:s.context.sessionId,p_request:requestId,p_token:claim.token,p_input:input,p_reply:reply,p_blocked:blocked})
  try {
    const quota=checked(await db.rpc('consume_coach_quota_for_plan',{p_daily_limit:s.access.limits.coachMessagesPerDay,p_monthly_limit:s.access.limits.coachMessagesPerMonth}))
    if (!quota?.allowed) throw new NativeError('limit','Your Clarity allowance is used for this period. Try again after it resets.',429)
    const prior=owner?(checked(await db.from('coach_messages').select('role,content').eq('conversation_id',conversationId).eq('user_id',u).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(14)) ?? []).reverse():[]
    const messages=[...prior,{role:'user',content:body.message.trim()}]
    while (messages.length>1 && messages.reduce((n,m)=>n+m.content.length,0)>12000) messages.shift()
    const validated=validateCoachRequest({messages});if (!validated.ok) throw new NativeError('input',validated.error)
    const [mood,goals]=await Promise.all([db.from('check_ins').select('mood,emotion_tags,energy').eq('user_id',u).order('created_at',{ascending:false}).limit(1).maybeSingle(),db.from('goals').select('title,category').eq('user_id',u).eq('is_complete',false).limit(3)])
    const result=await generateAdultReply(db,validated.messages,{name:s.context.profile.name,recent_check_in:mood.data,active_goals:goals.data ?? []})
    const current=checked(await db.rpc('native_session_context'))
    if (!current || current.sessionId!==s.context.sessionId || current.deleting || current.needsMfa || !current.consented || !current.aiConsented) throw new NativeError('sign_in','Sign in again before continuing.',401)
    if (checked(await finish(result.inputBlocked?null:body.message.trim(),result.content,result.inputBlocked))!==true) throw new NativeError('storage','This response could not be saved. Retry the same turn.',503)
    return {reply:result.content,blocked:result.inputBlocked,conversationId:result.inputBlocked?null:conversationId}
  } catch (error) {
    await Promise.resolve(finish(null,null,false)).catch(()=>undefined)
    throw error instanceof NativeError?error:new NativeError('coach','Clarity safety checks or generation are temporarily unavailable. Retry when connected.',503)
  }
}

export { randomUUID, CATEGORIES }
