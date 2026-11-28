// Operator-prepared, one invocation only. Does not install a scheduler or change flags.
import {pushHealth} from '../lib/notifications/policy.ts'
const args=new Set(process.argv.slice(2))
if(![...args].every(x=>['--execute','--health','--approved-adult-hosted'].includes(x)))throw new Error('Unknown scheduler option')
if(!args.has('--execute')){console.log('DRY RUN: future schedule should POST /api/notifications/dispatch once per minute; no request made. Health uses authenticated GET. No scheduler has been installed.');process.exit(0)}
if(process.env.ARIZE_EDITION!=='adult'||process.env.BROWSER_PUSH_SCHEDULER_APPROVED!=='true')throw new Error('Separate adult scheduler approval required')
const origin=process.env.NEXT_PUBLIC_APP_URL,url=new URL(origin??'')
if(url.origin!==origin||url.protocol!=='https:'||!args.has('--approved-adult-hosted')||/(^|[.-])students?([.-]|$)/i.test(url.hostname))throw new Error('Explicit approved canonical adult HTTPS target required')
const secret=process.env.BROWSER_PUSH_DISPATCH_SECRET
if(!secret||secret.length<32)throw new Error('Scheduler credential unavailable')
try{
 const response=await fetch(new URL('/api/notifications/dispatch',url),{method:args.has('--health')?'GET':'POST',headers:{authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(115000)})
 const result=await response.json()
 if(!response.ok)throw new Error()
 if(args.has('--health')){
  const safe=pushHealth(result);if(!safe)throw new Error();console.log(safe)
 }else{
  if(!['complete','partial','disabled'].includes(result.state))throw new Error()
  // No provider payloads, subscription capabilities, user identifiers or arbitrary JSON.
  console.log({state:result.state,stop:['empty','limit','budget','configuration','provider_auth','storage'].includes(result.stop)?result.stop:'unknown',monitoringUnavailable:result.monitoringUnavailable===true})
 }
}catch{console.error('Push scheduler call was not confirmed. Inspect protected health before retrying; no automatic retry was attempted.');process.exitCode=1}
