export const NATIVE_AI_DISCLOSURE = 'adult-native-ai-2026-11-22'
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const CATEGORIES = ['Career', 'Wellness', 'Reflection', 'Personal'] as const
export type NativeProfile = { name: string | null; username: string | null; onboarded: boolean }
export type NativeSession = {
  user: { id: string; email: string }; profile: NativeProfile; consented: boolean
  aiConsented: boolean; deleting: boolean; needsMfa: boolean
  access: { plan: 'core' | 'plus'; billingEnabled: boolean; temporarilyUnavailable?: boolean; continuity?: boolean }
  continuity: string | null
}
export type NativeGoal = { id: string; title: string; category: string; deadline: string | null; week_of: string; notes: string | null; is_complete: boolean; progress: number }
export type NativeRoom = { id: string; name: string; description: string | null; member: boolean; moderator: boolean }
export type NativeMessage = { id: string; user_id: string; content: string; created_at: string; name: string; message_type: string }
export type NativeConversation = { id: string; title: string; updated_at: string }
export type NativeChatMessage = { role: 'user' | 'assistant'; content: string }
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function weekStart(date = new Date()) {
  const value = new Date(date); value.setDate(value.getDate()-value.getDay()); value.setHours(0,0,0,0); return value
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value
}
export function goalDraft(body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !['id','title','category','deadline','week_of','notes'].includes(key))) return null
  if (typeof body.id !== 'string' || !UUID.test(body.id) || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 500
    || typeof body.category !== 'string' || !(CATEGORIES as readonly string[]).includes(body.category)
    || !validDate(body.week_of) || new Date(`${body.week_of}T12:00Z`).getUTCDay() !== 0
    || (body.deadline !== null && !validDate(body.deadline)) || (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 2000))) return null
  if (body.deadline && (body.deadline < body.week_of || body.deadline >= dateKey(new Date(new Date(`${body.week_of}T12:00:00`).getTime()+7*86400000)))) return null
  return { id: body.id, title: body.title.trim(), category: body.category, deadline: body.deadline, week_of: body.week_of, notes: typeof body.notes === 'string' ? body.notes.trim() || null : null }
}
