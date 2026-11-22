// Real local SQL + mocked transport. This CANNOT send an actual email.
import assert from 'node:assert/strict'
import {notifyLead} from '../../lib/marketing/notifications.ts'
if(!process.argv.includes('--synthetic-only'))throw new Error('Explicit synthetic fixture flag required')
const backend='http://127.0.0.1:3166'
const store={async call(name,args={}) {const r=await fetch(`${backend}/rest/v1/rpc/${name}`,{method:'POST',headers:{authorization:'Bearer synthetic-marketing-service','Content-Type':'application/json'},body:JSON.stringify(args)});assert.equal(r.status,200);return r.json()}}
const env={ARIZE_EDITION:'adult',MARKETING_NOTIFICATION_ENABLED:'true',MARKETING_LEAD_FROM_EMAIL:'notify@example.test',MARKETING_LEAD_NOTIFY_EMAIL:'owner@example.test',MARKETING_RESEND_API_KEY:'re_fictional_never_transmitted'}
let calls=0
const transport=async(url,init)=>{
 assert.equal(url,'https://api.resend.com/emails')
 const body=JSON.parse(String(init.body));assert.deepEqual(body.to,['owner@example.test']);assert.match(body.text,/@example\.test/)
 assert.match(init.headers['Idempotency-Key'],/^arize-lead\/[0-9a-f-]{36}$/)
 calls++;return Response.json({id:'fictional-transport-only'})
}
for(let i=0;i<20;i++) { const status=await notifyLead(store,env,null,transport);if(status==='nothing_due')break;assert.equal(status,'sent') }
assert.ok(calls>0)
assert.equal(await notifyLead(store,env,null,transport),'nothing_due')
console.log(`Real local SQL notification workflow passed: ${calls} fictional messages accepted by MOCK transport, zero real emails sent, no duplicate reclaims.`)
