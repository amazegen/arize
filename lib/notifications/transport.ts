import { request as httpsRequest } from 'node:https'
import { generateRequestDetails } from 'web-push'
import { subscriptionInput } from './policy.ts'
import type { PushTransport } from './delivery.ts'

// SDK encryption/VAPID with a hard deadline, no redirects/proxies or raw errors.
export function boundedPushTransport(request:typeof httpsRequest=httpsRequest):PushTransport {
 return async(subscription,payload,options)=>{
  if(!subscriptionInput(subscription))throw new Error('Unsupported push destination')
  const details=generateRequestDetails(subscription,payload,options)
  await new Promise<void>((resolve,reject)=>{
   let settled=false
   const finish=(error?:Error|{statusCode:number})=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve()}
   const controller=new AbortController()
   const timer=setTimeout(()=>{controller.abort();finish(new Error('Push delivery deadline exceeded'))},5000)
   try{
    const req=request(details.endpoint,{method:details.method,headers:details.headers,signal:controller.signal},res=>{
     const status=res.statusCode??0;res.resume()
     // Do not wait on or retain an unbounded provider response body.
     finish(status>=200&&status<300?undefined:{statusCode:status});res.destroy()
    })
    req.once('error',()=>finish(new Error('Push transport unavailable')))
    req.end(details.body)
   }catch{finish(new Error('Push transport unavailable'))}
  })
 }
}
