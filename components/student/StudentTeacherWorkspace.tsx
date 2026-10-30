"use client";
import { useState } from "react";
import Link from "next/link";
import StaffRoleFrame from "./StaffRoleFrame";
import { studentFetch } from "@/lib/student/fetch-client";
import useUnsavedForm from "./useUnsavedForm";
import { RESET_LESSONS } from "@/lib/student/learning";
import type { OperationsState } from "@/lib/student/operations";
export default function StudentTeacherWorkspace({ initial }: { initial: OperationsState }) {
  const [state, setState] = useState(initial);
  const { dirty, setDirty } = useUnsavedForm();
  const [selected, setSelected] = useState(initial.classes[0]?.id ?? "");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const record = state.records.find((r) => r.classroom_id === selected && r.day === day);
  function selectRecord(nextClass: string, nextDay: string) {
    if (dirty && !window.confirm("You have unsaved class totals. Discard those edits and change the selected record?")) return;
    setSelected(nextClass); setDay(nextDay); setDirty(false);
  }
  async function save(event: React.FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = action === "class" ? { action, label: f.get("label") } : { action, classId: selected, day, enrolled: Number(f.get("enrolled")), present: Number(f.get("present")), absent: Number(f.get("absent")), lesson: f.get("lesson") || null };
      const response = await studentFetch("/api/student/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not save.");
      setDirty(false);
      const fresh = await studentFetch("/api/student/operations");
      if (!fresh.ok) throw new Error("Saved, but the updated view could not be loaded. Reload before editing again.");
      const result = await fresh.json(); setState(result.state); if (!selected) setSelected(result.state.classes[0]?.id ?? "");
      if (action === "class") form.reset();
      setMessage("Saved to your school’s backend. No individual student attendance records were collected.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); } finally { setBusy(false); }
  }
  return <StaffRoleFrame role="Teacher" schoolName={state.schoolName ?? "Assigned school"} home="/student/teacher"><main className="staff-content" onChange={event => { if (event.target instanceof Element && event.target.closest("form")) setDirty(true); }}>
    <p className="staff-eyebrow">TEACHER WORKSPACE · {state.schoolName}</p><h1>Your classroom, not a student surveillance feed.</h1><p>Record class-level attendance and whether you ran a Class Reset. You cannot view student chats, goals, emotional scores or counselor requests.</p>
    {error && <p role="alert" className="student-error">{error}</p>}{message && <p role="status" className="student-success">{message}</p>}
    <div className="staff-resource-grid"><section className="student-card"><h2>Your classes</h2><form className="student-form" onSubmit={(e) => save(e, "class")}><label>Class label<input name="label" placeholder="Advisory · Period 1" maxLength={80} required /></label><p>No student names, rosters or personal notes.</p><button className="student-action" disabled={busy}>Add class</button></form></section>
    <section className="student-card"><h2>Attendance & Class Reset</h2>{!state.features.attendance ? <p>Attendance collection is awaiting the school’s authorization. You can prepare class labels, but no attendance is collected yet.</p> : state.classes.length === 0 ? <p>Add a class first.</p> : <><div className="student-form"><label>Class<select value={selected} onChange={(e) => selectRecord(e.target.value, day)}>{state.classes.map((c) => <option value={c.id} key={c.id}>{c.label}</option>)}</select></label><label>Date (UTC calendar)<input type="date" value={day} onChange={(e) => selectRecord(selected, e.target.value)} /></label></div><form className="student-form" key={`${selected}:${day}:${record?.enrolled}:${record?.present}`} onSubmit={(e) => save(e, "attendance")}>
      <label>Enrolled total<input name="enrolled" type="number" min={1} max={500} defaultValue={record?.enrolled} required /></label><label>Present<input name="present" type="number" min={0} max={500} defaultValue={record?.present} required /></label><label>Absent<input name="absent" type="number" min={0} max={500} defaultValue={record?.absent} required /></label><label>Class Reset held that day<select name="lesson" defaultValue={record?.reset_lesson ?? ""}><option value="">No Class Reset recorded</option>{RESET_LESSONS.map((l) => <option key={l.id} value={l.id}>{l.title.en}</option>)}</select></label><p>Present + absent must equal enrolled. Saving again replaces this class/day record, not adds another attendance count. School reports count student-sessions, not unique students.</p><button className="student-action" disabled={busy}>Save daily totals</button></form></>}</section></div>
    <section className="student-card"><h2>Recent saved records</h2>{state.records.length ? <div className="staff-table-scroll"><table className="staff-data-table"><thead><tr><th>Class</th><th>Date</th><th>Present</th><th>Absent</th><th>Enrolled</th></tr></thead><tbody>{state.records.map((r) => <tr key={`${r.classroom_id}:${r.day}`}><td>{state.classes.find((c) => c.id === r.classroom_id)?.label}</td><td>{r.day}</td><td>{r.present}</td><td>{r.absent}</td><td>{r.enrolled}</td></tr>)}</tbody></table></div> : <p>No attendance records have been saved. This is not zero attendance.</p>}</section>
    <Link className="student-action" href="/student/class-reset">Open Class Reset classroom tools</Link>
  </main></StaffRoleFrame>;
}
