import {createHmac,timingSafeEqual} from 'node:crypto'
export function reminderAccountGuard(userId:string,secret:string|undefined){
 if(!secret||secret.length<32)throw new Error('Reminder action binding unavailable')
 return createHmac('sha256',secret).update('arize:browser-reminder-action:v1:'+userId).digest('hex')
}
export function matchesReminderAccount(value:unknown,expected:string){
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return false
 return timingSafeEqual(Buffer.from(value),Buffer.from(expected))
}
