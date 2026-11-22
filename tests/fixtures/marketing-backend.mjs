// Synthetic loopback adapter to REAL local marketing SQL. No real Auth,
// outbound email, provider calls, credentials or hosted databases are used.
import {createServer} from 'node:http'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile),socket=process.env.ARIZE_TEST_SOCKET
if(!process.argv.includes('--synthetic-only') || !/^\/private\/tmp\/arize-phase6\.[A-Za-z0-9]+$/.test(socket ?? ''))throw new Error('Explicit synthetic flag and disposable Phase 6 socket required')
const query=async sql=>(await run('/opt/homebrew/bin/psql',['-XAtq','-h',socket,'-p','55461','-U','arize_phase6_test','-d','marketing_ui','-v','ON_ERROR_STOP=1','-c',sql],{timeout:8000})).stdout.trim()
if(await query("select current_database()||':'||coalesce(to_regclass('public.marketing_leads')::text,'missing')")!=='marketing_ui:marketing_leads')throw new Error('Fresh local marketing schema required')
const quote=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'http://127.0.0.1:3167','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(body))}
createServer(async(req,res)=>{
 try {
  if(req.headers.host!=='127.0.0.1:3166')return json(res,403,{})
  const url=new URL(req.url,'http://127.0.0.1:3166')
  if(req.method==='OPTIONS')return json(res,200,{})
  if(url.pathname.startsWith('/auth/v1/'))return json(res,401,{message:'No real authentication in this marketing fixture'})
  if(req.headers.authorization!=='Bearer synthetic-marketing-service')return json(res,403,{message:'No direct browser access'})
  if(url.pathname==='/fixture-counts')return json(res,200,JSON.parse(await query("select jsonb_build_object('leads',count(*),'notified',count(*) filter(where notification_status='sent'),'pending',count(*) filter(where notification_status='pending')) from public.marketing_leads")))
  if(!url.pathname.startsWith('/rest/v1/rpc/')||req.method!=='POST')return json(res,404,{})
  if(process.argv.includes('--storage-unavailable'))return json(res,503,{message:'Local outage fixture'})
  let raw='';for await(const part of req){raw+=part;if(raw.length>4096)return json(res,413,{})}
  let body;try{body=JSON.parse(raw)}catch{return json(res,400,{})}
  const name=url.pathname.split('/').at(-1)
  const signatures={marketing_capture_lead:['p_email','p_ip_key','p_email_key','p_consent_version'],marketing_claim_notification:['p_lead_id','p_config_hash'],marketing_finish_notification:['p_lead_id','p_token','p_result'],marketing_purge_expired:[]}
  if(!Object.hasOwn(signatures,name)||Object.keys(body).some(k=>!signatures[name].includes(k)))return json(res,400,{})
  const args=signatures[name].map(k=>quote(body[k]??null)).join(',')
  const value=await query(`begin;set local role service_role;select to_jsonb(public.${name}(${args}));commit;`)
  return json(res,200,value?JSON.parse(value):null)
 }catch{return json(res,503,{message:'Local fixture request failed'})}
}).listen(3166,'127.0.0.1',()=>console.log('Synthetic marketing SQL backend: 127.0.0.1:3166. No hosted services.'))
