import { pushSenderConfig, REMINDER, subscriptionInput, type PushEnv, type PushStore, type BrowserSubscription } from './policy.ts'
export type PushTransport = (subscription: BrowserSubscription, payload: string, options: {
 vapidDetails: { publicKey: string; privateKey: string; subject: string }
 TTL: number; timeout: number; urgency: 'low'; topic: string
}) => Promise<unknown>
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function pushCapacity(env:PushEnv){
 const parse=(value:string|undefined,fallback:number,min:number,max:number)=>value===undefined?fallback:/^\d+$/.test(value)&&Number(value)>=min&&Number(value)<=max?Number(value):null
 const maxJobs=parse(env.BROWSER_PUSH_MAX_JOBS_PER_RUN,100,20,500),concurrency=parse(env.BROWSER_PUSH_CONCURRENCY,8,1,8)
 return maxJobs&&concurrency?{maxJobs,concurrency}:null
}
export async function dispatchPush(store:PushStore,env:PushEnv,send:PushTransport,clock=()=>performance.now()){
 const start=clock(),deadline=start+80000,capacity=pushCapacity(env),vapidDetails=pushSenderConfig(env)
 const totals={state:'complete',stop:'empty',claimed:0,sent:0,retry:0,removed:0,failed:0,revoked:0,unconfirmed:0,elapsedMs:0}
 if(!vapidDetails||!capacity)return {...totals,state:'disabled',stop:'configuration'}
 let storageFailed=false,providerAuth=false
 while(totals.claimed<capacity.maxJobs){
  // Reserve 8s lease query + 5s HTTPS + 8s finish per worker wave, plus 8s claim.
  const slots=Math.floor((deadline-clock()-8000)/22000)*capacity.concurrency
  const limit=Math.min(20,capacity.maxJobs-totals.claimed,slots)
  if(limit<=0){totals.stop='budget';break}
  let value:unknown
  try{value=await store.call('browser_push_claim',{p_limit:limit})}catch{storageFailed=true;break}
  if(!Array.isArray(value)||value.length>limit)throw new Error('Invalid reminder batch')
  const claims=value as {id:string;token:string;subscription:unknown}[]
  if(claims.some(c=>!c||!uuid.test(c.id)||!uuid.test(c.token)))throw new Error('Invalid reminder claim')
  if(!claims.length)break
  totals.claimed+=claims.length
  let index=0
  const worker=async()=>{
   while(index<claims.length){
    const claim=claims[index++]
    try{
     if(await store.call('browser_push_lease_valid',{p_id:claim.id,p_token:claim.token})!==true){totals.revoked++;continue}
     let outcome:'sent'|'retry'|'gone'|'failed'='failed'
     const subscription=subscriptionInput(claim.subscription)
     if(subscription&&!providerAuth){
      try{await send(subscription,JSON.stringify(REMINDER),{vapidDetails,TTL:900,timeout:5000,urgency:'low',topic:REMINDER.tag});outcome='sent'}
      catch(error){
       const status=error&&typeof error==='object'&&'statusCode'in error?Number(error.statusCode):0
       outcome=[404,410].includes(status)?'gone':!status||status===429||status>=500?'retry':'failed'
       if([401,403].includes(status)&&!providerAuth){providerAuth=true;await store.call('browser_push_pause')}
      }
     }
     const recorded=await store.call('browser_push_finish',{p_id:claim.id,p_token:claim.token,p_result:outcome})
     if(recorded!==true){storageFailed=true;totals.unconfirmed++;continue}
     totals[outcome==='gone'?'removed':outcome]++
    }catch{storageFailed=true;totals.unconfirmed++}
   }
  }
  await Promise.all(Array.from({length:Math.min(capacity.concurrency,claims.length)},worker))
  if(storageFailed||providerAuth)break
  if(claims.length<limit)break
  if(totals.claimed===capacity.maxJobs)totals.stop='limit'
 }
 if(storageFailed){totals.state='partial';totals.stop='storage'}
 else if(providerAuth){totals.state='partial';totals.stop='provider_auth'}
 totals.elapsedMs=Math.min(120000,Math.max(0,Math.round(clock()-start)))
 return totals
}
