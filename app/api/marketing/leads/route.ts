import { after } from 'next/server'
import { captureConfigured, captureLead, leadInput, LEAD_SUCCESS, rateKeys, sameMarketingOrigin } from '@/lib/marketing/policy'
import { notifyLead } from '@/lib/marketing/notifications'
import { marketingStore } from '@/lib/marketing/server'

export const runtime = 'nodejs'
export const maxDuration = 30
const headers = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' }
export async function POST(request: Request) {
  const reply = (body: unknown,status = 200) => Response.json(body,{status,headers})
  if (process.env.ARIZE_EDITION === 'student') return reply({error:'Not found.'},404)
  if (!captureConfigured(process.env)) return reply({error:'The updates list is not available yet. You can still create an Arize account.'},503)
  if (!sameMarketingOrigin(request,process.env)) return reply({error:'Please submit the form from the Arize website.'},403)
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({error:'Invalid request.'},415)
  let body: unknown
  try {
    const reader = request.body?.getReader(); if (!reader) return reply({error:'Invalid request.'},400)
    let size = 0; const chunks: Uint8Array[] = []
    while (true) {
      const {value,done} = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 2_048) { await reader.cancel(); return reply({error:'Please send only your email and consent.'},413) }
      chunks.push(value)
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { return reply({error:'Invalid request.'},400) }
  const input = leadInput(body)
  if (input === 'honeypot') return reply({message:LEAD_SUCCESS})
  if (!input) return reply({error:'Enter a valid email and confirm that you would like to hear from AmazeGen.'},400)
  try {
    const store = marketingStore()
    const result = await captureLead(store,input.email,rateKeys(request,input.email,process.env))
    if (!result.accepted) return Response.json({error:'Too many requests. Please try again later.'},{status:429,headers:{...headers,'Retry-After':'3600'}})
    if (result.leadId) after(async () => {
      const status = await notifyLead(store,process.env,result.leadId)
      if (['retry','review','unavailable'].includes(status)) console.warn('[marketing notification]',{state:status})
    })
    return reply({message:LEAD_SUCCESS})
  } catch {
    console.warn('[marketing capture]',{state:'unavailable'})
    return reply({error:'We could not save your request. Please try again later.'},503)
  }
}
