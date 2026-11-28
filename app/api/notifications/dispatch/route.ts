import { timingSafeEqual } from 'node:crypto'
import { dispatchPush } from '@/lib/notifications/delivery'
import { pushStore } from '@/lib/notifications/server'
import { pushEnabled,pushHealth } from '@/lib/notifications/policy'
import { boundedPushTransport } from '@/lib/notifications/transport'

export const runtime = 'nodejs'
export const maxDuration = 120
const headers={ 'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff' }
function authorized(request:Request){
  const secret = process.env.BROWSER_PUSH_DISPATCH_SECRET ?? '', received = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(received), b = Buffer.from(expected)
  return secret.length>=32&&a.length===b.length&&timingSafeEqual(a,b)
}
export async function GET(request:Request){
  if(process.env.ARIZE_EDITION!=='adult')return new Response(null,{status:404,headers})
  if(!authorized(request))return new Response(null,{status:401,headers})
  if(new URL(request.url).search)return new Response(null,{status:400,headers})
  try{const result=pushHealth(await pushStore().call('browser_push_health'));if(!result)throw new Error();return Response.json({flagsEnabled:pushEnabled(process.env),sendingEnabled:process.env.BROWSER_PUSH_SEND_ENABLED==='true',...result},{headers})}
  catch{return Response.json({error:'Reminder monitoring unavailable.'},{status:503,headers})}
}
export async function POST(request: Request) {
  if (process.env.ARIZE_EDITION !== 'adult') return new Response(null, { status: 404, headers })
  if (!authorized(request)) return new Response(null, { status: 401, headers })
  if (!pushEnabled(process.env) || process.env.BROWSER_PUSH_SEND_ENABLED !== 'true') return Response.json({ state: 'disabled' }, { headers })
  try {
    const store=pushStore(),result=await dispatchPush(store,process.env,boundedPushTransport())
    let monitoringUnavailable=false
    try{await store.call('browser_push_record_run',{p_summary:result})}catch{monitoringUnavailable=true}
    return Response.json({...result,monitoringUnavailable}, {status:result.state==='partial'?503:200,headers})
  } catch { return Response.json({ error: 'Reminder dispatch unavailable.' }, { status: 503, headers }) }
}
