// Explicit operator invocation only: no scheduled job, no auto-deployment.
import { createClient } from '@supabase/supabase-js'
import { captureConfigured } from '../lib/marketing/policy.ts'
import { notifyLead } from '../lib/marketing/notifications.ts'
const args=new Set(process.argv.slice(2))
if (!args.has('--apply') || args.has('--local-only')===args.has('--approved-adult-hosted') || ![...args].every(x=>['--apply','--local-only','--approved-adult-hosted','--retry','--purge'].includes(x)) || (!args.has('--retry')&&!args.has('--purge'))) throw new Error('Choose one approved target mode, --apply, and --retry and/or --purge')
const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
const loopback=['127.0.0.1','localhost'].includes(url.hostname)
if (!captureConfigured(process.env) || (args.has('--local-only')&&!loopback)) throw new Error('Configured adult target required; local-only mode refuses hosted databases')
// Future operator use only, after separate approval. No hosted invocation is
// part of Phase 6 verification. The SQL also refuses a Student schema.
if(args.has('--approved-adult-hosted') && (loopback || url.protocol!=='https:' || process.env.ARIZE_EDITION!=='adult' || process.env.MARKETING_MAINTENANCE_APPROVED!=='true')) throw new Error('Hosted maintenance requires separate explicit adult approval')
const client=createClient(url.href,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const store={async call(name,params) { const r=await client.rpc(name,params).abortSignal(AbortSignal.timeout(8000));if(r.error)throw new Error('Maintenance unavailable');return r.data }}
try {
 if(args.has('--retry')) {
  const totals={sent:0,retry:0,review:0,other:0}
  for(let i=0;i<20;i++) { const result=await notifyLead(store,process.env);if(['nothing_due','not_configured','unavailable'].includes(result))break;if(result in totals)totals[result]++;else totals.other++ }
  console.log({notifications:totals})
 }
 if(args.has('--purge')) console.log({expiredLeadRecordsRemoved:await store.call('marketing_purge_expired')})
} catch { console.error('Marketing maintenance could not finish; no personal data logged.');process.exitCode=1 }
