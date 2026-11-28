// This page is deliberately unavailable on hosted/adult production or Student.
export const LOCAL_PUSH_ORIGIN = 'http://127.0.0.1:3190'
export const LOCAL_PUSH_REVISION = 'local-diagnostics-2026-11-25-v1'
export const LOCAL_PUSH_STAGES = ['worker_activated', 'push_received', 'display_requested', 'display_resolved', 'display_failed', 'notification_clicked', 'navigation_resolved', 'navigation_failed'] as const
export type LocalPushStage = typeof LOCAL_PUSH_STAGES[number]
export interface LocalPushEvent { at: string; eventId: string; stage: LocalPushStage; error: string | null }
export interface LocalPushReceipt { version: 1; revision: string; storageAvailable: boolean; events: LocalPushEvent[] }
const errors = ['NotAllowedError', 'InvalidStateError', 'TypeError', 'AbortError', 'UnknownError', 'OtherError']

export function localPushPageAllowed(env:Record<string,string|undefined>,host:string|null) {
  return env.ARIZE_EDITION==='adult' && env.ARIZE_LOCAL_PUSH_DIAGNOSTICS==='true' && !env.VERCEL
    && env.NEXT_PUBLIC_APP_URL===LOCAL_PUSH_ORIGIN && env.NEXT_PUBLIC_SUPABASE_URL==='http://127.0.0.1:56581'
    && host==='127.0.0.1:3190'
}
export function localPushReceipt(value:unknown,now=Date.now()):LocalPushReceipt|null {
  if(!value||typeof value!=='object')return null
  const v=value as Record<string,unknown>
  if(v.version!==1||v.revision!==LOCAL_PUSH_REVISION||typeof v.storageAvailable!=='boolean'||!Array.isArray(v.events)||v.events.length>64)return null
  const events:LocalPushEvent[]=[]
  for(const input of v.events){
    if(!input||typeof input!=='object')return null
    const row=input as Record<string,unknown>,at=Date.parse(String(row.at))
    if(typeof row.at!=='string'||!Number.isFinite(at)||at<now-86400000||at>now+60000
      ||typeof row.eventId!=='string'||!/^[a-f0-9-]{36}$/.test(row.eventId)
      ||!LOCAL_PUSH_STAGES.includes(row.stage as LocalPushStage)
      ||(row.error!==null&&(typeof row.error!=='string'||!errors.includes(row.error))))return null
    events.push({at:row.at,eventId:row.eventId,stage:row.stage as LocalPushStage,error:row.error as string|null})
  }
  return {version:1,revision:LOCAL_PUSH_REVISION,storageAvailable:v.storageAvailable,events}
}
