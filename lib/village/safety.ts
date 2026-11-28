export const REPORT_REASONS=['spam','harassment','hate','sexual','violence','other'] as const
export const MODERATION_ACTIONS=['hide','dismiss','restore','mute','unmute'] as const
export type SafetyRequest={p_action:string;p_room?:string;p_message?:string;p_target?:string;p_reason?:string;p_decision?:string}
export type SafetyState={moderator:boolean;blocks:{id:string;name:string}[]}
export type ReportRow={messageId:string;reason:string;status:string;createdAt:string;content:string;muted:boolean}
export type SafetyRpc=(request:SafetyRequest)=>Promise<unknown>
export function validSafetyRequest(value:Record<string,unknown>):value is Record<string,unknown>&SafetyRequest {
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
 if(Object.keys(value).some(key=>!['p_action','p_room','p_message','p_target','p_reason','p_decision'].includes(key)))return false
 if(!['state','queue','report','block','unblock','moderate'].includes(String(value.p_action)))return false
 for(const key of ['p_room','p_message','p_target'])if(value[key]!==undefined&&(typeof value[key]!=='string'||!uuid.test(value[key] as string)))return false
 if(value.p_action!=='unblock'&&!value.p_room)return false
 if(['report','block','moderate'].includes(String(value.p_action))&&!value.p_message)return false
 if(value.p_action==='unblock'&&!value.p_target)return false
 if(value.p_action==='report'&&!(REPORT_REASONS as readonly unknown[]).includes(value.p_reason))return false
 if(value.p_action==='moderate'&&!(MODERATION_ACTIONS as readonly unknown[]).includes(value.p_decision))return false
 return value.p_reason===undefined||(REPORT_REASONS as readonly unknown[]).includes(value.p_reason)
}
export function safetyError(error:unknown):string {
 const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):''
 if(code==='P0001')return 'Please wait before trying again. Posting may be paused or an account limit reached.'
 if(code==='42501')return 'This message or safety action is not available for your account.'
 return 'The change was not confirmed. Please refresh and try again.'
}
