'use client'
import {useEffect,useRef,useState} from 'react'
import {REPORT_REASONS,MODERATION_ACTIONS,safetyError,type ReportRow,type SafetyState,type SafetyRpc} from '../../lib/village/safety'

const buttonStyle={minHeight:44,background:'transparent',border:'1px solid #b8ccb8',borderRadius:12,padding:'8px 12px',color:'#23633f',cursor:'pointer'}
export function MessageSafety({roomId,messageId,rpc,onChanged}:{roomId:string;messageId:string;rpc:SafetyRpc;onChanged:()=>void}){
 const [reporting,setReporting]=useState(false),[reason,setReason]=useState<string>('spam'),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function act(action:'report'|'block'){
  if(busy)return;setBusy(true);setNotice('')
  try{await rpc({p_action:action,p_room:roomId,p_message:messageId,...(action==='report'?{p_reason:reason}:{})});if(alive.current){setReporting(false);setNotice(action==='report'?'Report saved for moderator review. This is not an emergency service.':'Account blocked.');if(action==='block')onChanged()}}
  catch(error){if(alive.current)setNotice(safetyError(error))}finally{if(alive.current)setBusy(false)}
 }
 return <div style={{marginTop:8,fontSize:13}}>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" style={buttonStyle} disabled={busy} onClick={()=>setReporting(value=>!value)} aria-expanded={reporting}>Report message</button><button type="button" style={buttonStyle} disabled={busy} onClick={()=>{void act('block')}}>Block author</button></div>
  {reporting&&<div><label>Report reason<select aria-label="Report reason" value={reason} onChange={e=>setReason(e.target.value)} style={{minHeight:44,maxWidth:'100%',margin:8}}>{REPORT_REASONS.map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label><button type="button" style={buttonStyle} disabled={busy} onClick={()=>{void act('report')}}>Submit report</button></div>}
  <p role="status">{notice}</p>
 </div>
}
export function RoomSafety({roomId,rpc,onChanged}:{roomId:string;rpc:SafetyRpc;onChanged:()=>void}){
 const [open,setOpen]=useState(false),[state,setState]=useState<SafetyState|null>(null),[reports,setReports]=useState<ReportRow[]|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function refresh(){const value=await rpc({p_action:'state',p_room:roomId}) as SafetyState;if(alive.current)setState(value)}
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setNotice('');try{await action()}catch(error){if(alive.current)setNotice(safetyError(error))}finally{if(alive.current)setBusy(false)}}
 async function queue(){const value=await rpc({p_action:'queue',p_room:roomId}) as {reports:ReportRow[]};if(alive.current)setReports(value.reports)}
 return <aside aria-label="Village safety" style={{padding:'8px 0',fontSize:14}}>
  <button type="button" style={buttonStyle} aria-expanded={open} disabled={busy} onClick={()=>{setOpen(value=>!value);if(!open)void run(refresh)}}>Room safety</button>
  {open&&<div style={{padding:12,border:'1px solid #dce6db',borderRadius:12,marginTop:8,maxHeight:300,overflowY:'auto'}}>
   <p>Report harmful messages or block an account. Blocks hide each other’s messages across Village; they do not prevent sharing a room. Reports are not monitored live. In immediate danger call 911; U.S. crisis support: 988.</p>
   {!state?<p role="status">{busy?'Loading safety settings…':'Safety settings unavailable. Close and reopen to retry.'}</p>:<>
    <h2 style={{fontSize:16,marginTop:10}}>Blocked accounts</h2>{state.blocks.length===0?<p>No blocked accounts.</p>:state.blocks.map(block=><div key={block.id}><span>{block.name} </span><button type="button" style={buttonStyle} disabled={busy} onClick={()=>{void run(async()=>{await rpc({p_action:'unblock',p_target:block.id});await refresh();onChanged()})}}>Unblock {block.name}</button></div>)}
    {state.moderator&&<><h2 style={{fontSize:16,marginTop:10}}>Moderator review · this room only</h2><button type="button" style={buttonStyle} disabled={busy} onClick={()=>{void run(queue)}}>Review reports</button>
     {reports?.length===0&&<p>No reports for this room.</p>}{reports?.map((report,index)=><article key={`${report.messageId}:${index}`} style={{padding:10,borderBottom:'1px solid #dce6db'}}><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{report.content}</p><p>{report.reason} · {report.status}{report.muted?' · author muted':''}</p><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{MODERATION_ACTIONS.filter(action=>action!=='mute'||!report.muted).filter(action=>action!=='unmute'||report.muted).map(action=><button type="button" key={action} style={buttonStyle} disabled={busy} onClick={()=>{void run(async()=>{await rpc({p_action:'moderate',p_room:roomId,p_message:report.messageId,p_decision:action});await queue();onChanged()})}}>{action==='mute'?'Mute author 24h':action==='unmute'?'Unmute author':action[0].toUpperCase()+action.slice(1)}</button>)}</div></article>)}
    </>}
   </>}
  </div>}
  <p role="status">{notice}</p>
 </aside>
}
