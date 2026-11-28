// Approved one-device Chrome acceptance only. Never a scheduler or hosted DB tool.
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,realpathSync,statSync,openSync,closeSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {generateVAPIDKeys} from 'web-push'
import {localServices,localSql} from './native-services-env.mjs'

export function chromeReviewKeys(){
 const file=realpathSync(process.env.ARIZE_CHROME_TEST_KEYS??'')
 assert.match(file,/^\/private\/tmp\/arize-push-chrome-[A-Za-z0-9]+\/keys.json$/)
 const meta=statSync(file)
 assert.equal(meta.mode&0o777,0o600)
 assert.equal(meta.uid,process.getuid())
 const keys=JSON.parse(readFileSync(file,'utf8'))
 assert.equal(Buffer.from(keys.publicKey,'base64url').length,65)
 assert.equal(Buffer.from(keys.privateKey,'base64url').length,32)
 assert.ok(Number.isFinite(Date.parse(keys.createdAt)))
 return {...keys,file}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const action=process.argv[2]
 assert.ok(process.argv.includes(action==='send-second'?'--approved-second-generic-reminder':'--approved-one-generic-reminder'))
 localServices() // Exact unlinked loopback stack; no hosted credentials.
 if(action==='init'){
  const dir=mkdtempSync('/private/tmp/arize-push-chrome-')
  writeFileSync(dir+'/keys.json',JSON.stringify({...generateVAPIDKeys(),createdAt:new Date().toISOString()}),{mode:0o600,flag:'wx'})
  console.log('Dedicated local-test key file: '+dir+'/keys.json')
 }else if(action==='send'||action==='send-second'){
  const keys=chromeReviewKeys()
  if(action==='send-second'){
   const first=JSON.parse(readFileSync(keys.file.replace('keys.json','attempt.json'),'utf8'))
   assert.equal(first.state,'provider_accepted');assert.equal(first.count,1)
  }
  assert.equal(localSql('select enabled from public.browser_push_control where id'),'f','Scheduler must remain paused')
  assert.equal(localSql("select edition from public.clarity_installation"),'adult')
  assert.equal(localSql("select to_regclass('public.student_schools') is null"),'t')
  const rows=JSON.parse(localSql("select coalesce(json_agg(json_build_object('subscription',s.subscription,'createdAt',s.created_at,'eligible',public.browser_push_eligible(s.user_id),'enabled',p.enabled)),'[]'::json) from public.browser_push_subscriptions s join auth.users u on u.id=s.user_id join public.browser_push_preferences p on p.user_id=s.user_id where u.email='review-native@example.test' and s.subscription->>'endpoint' like 'https://fcm.googleapis.com/%'"))
  const fresh=rows.filter(row=>Date.parse(row.createdAt)>=Date.parse(keys.createdAt))
  assert.equal(fresh.length,1,'Exactly one newly enrolled fictional-reviewer Chrome device required')
  assert.equal(fresh[0].eligible,true);assert.equal(fresh[0].enabled,true)
  const {subscriptionInput,REMINDER}=await import('../../lib/notifications/policy.ts')
  const subscription=subscriptionInput(fresh[0].subscription)
  assert.ok(subscription)
  const {boundedPushTransport}=await import('../../lib/notifications/transport.ts')
  // Persist before network. An ambiguous failure MUST NOT cause a second send.
  // Second action requires separate user approval and keeps the first receipt intact.
  const receipt=keys.file.replace('keys.json',action==='send-second'?'attempt-2.json':'attempt.json')
  const fd=openSync(receipt,'wx',0o600);closeSync(fd)
  const startedAt=new Date().toISOString()
  writeFileSync(receipt,JSON.stringify({startedAt,state:'attempted',count:1}),{mode:0o600})
  try{
   await boundedPushTransport()(subscription,JSON.stringify(REMINDER),{TTL:60,urgency:'normal',topic:'arize-daily-check-in',vapidDetails:{subject:'mailto:fictional@example.test',publicKey:keys.publicKey,privateKey:keys.privateKey}})
   writeFileSync(receipt,JSON.stringify({startedAt,state:'provider_accepted',count:1}),{mode:0o600})
   console.log('ONE generic reminder accepted by Chrome push provider. No scheduler enabled. Display still requires UI verification.')
  }catch(error){
   const status=Number.isInteger(error?.statusCode)?error.statusCode:null
   writeFileSync(receipt,JSON.stringify({startedAt,state:'not_confirmed',count:1,status}),{mode:0o600})
   console.log('One attempt only; delivery not confirmed'+(status?' (HTTP '+status+')':'')+'. No retry will be made.')
   process.exitCode=1
  }
 }else throw new Error('Use init, send, or separately approved send-second')
}
