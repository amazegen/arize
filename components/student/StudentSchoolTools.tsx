"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { studentFetch } from "@/lib/student/fetch-client";
import useUnsavedForm from "./useUnsavedForm";
export default function StudentSchoolTools() {
  const router = useRouter(); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const { setDirty } = useUnsavedForm();
  const now=new Date(); const currentMonth=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01`;
  const previous=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,10);
  async function submit(event:React.FormEvent<HTMLFormElement>,action:string) {
    event.preventDefault(); const f=new FormData(event.currentTarget); setBusy(true);setError("");setMessage("");
    try {
      const payload=action==="publish"?{action,month:`${f.get("month")}-01`}:{action,month:`${f.get("month")}-01`,interested:Number(f.get("interested")),oriented:Number(f.get("oriented")),active:Number(f.get("active"))};
      const response=await studentFetch("/api/student/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json();if(!response.ok)throw new Error(body.error??"Could not save.");
      setDirty(false);
      setMessage(action==="publish"?"Completed-month snapshot published or already present. Existing snapshots are not recalculated.":"School-reported ambassador totals saved.");router.refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save.");}finally{setBusy(false);}
  }
  return <details className="student-card" onChange={() => setDirty(true)}><summary>School reporting & program tools</summary>{error&&<p role="alert" className="student-error">{error}</p>}{message&&<p role="status" className="student-success">{message}</p>}<div className="staff-resource-grid">
    <form className="student-form" onSubmit={(e)=>submit(e,"publish")}><h2>Publish a completed month</h2><p>Includes approved participation, voluntary topics, belonging, teacher-entered class records and school-reported program totals. Data must exist first. Reports withhold small groups and remain frozen; no date/grade drill-down is added.</p><label>Completed month<input name="month" type="month" defaultValue={previous.slice(0,7)} max={previous.slice(0,7)} required/></label><button className="student-action" disabled={busy}>Publish school report</button></form>
    <form className="student-form" onSubmit={(e)=>submit(e,"ambassadors")}><h2>Ambassador program totals</h2><p>Enter verified program counts—not estimates. This collection needs the school’s authorization. Names, personal notes and service-hour certifications are not collected here.</p><label>Program month<input name="month" type="month" defaultValue={currentMonth.slice(0,7)} max={currentMonth.slice(0,7)} required/></label>{[["interested","Expressed interest"],["oriented","Attended orientation"],["active","Active ambassadors"]].map(([name,label])=><label key={name}>{label}<input name={name} type="number" min={0} max={10000} required/></label>)}<p>Active ≤ oriented ≤ interested. A published period cannot be edited through this form.</p><button className="student-action" disabled={busy}>Save program totals</button></form>
  </div></details>;
}
