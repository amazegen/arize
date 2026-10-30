"use client";
import { useState } from "react";
import { studentFetch } from "@/lib/student/fetch-client";
type Enrollment = { found: boolean; userId?: string; status?: string | null; schoolId?: string | null; consentVerified?: boolean; adultRole?: boolean };
export default function StudentEnrollmentTools({ schools, onSaved }: { schools: { id: string; name: string }[]; onSaved: () => void }) {
  const [email, setEmail] = useState(""); const [schoolId, setSchoolId] = useState("");
  const [record, setRecord] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value ?? "lookup";
    try {
      const response = await studentFetch("/api/student/operator/enrollment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, schoolId, reference: form.get("reference"), confirmed: form.get("confirmed") === "on" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not confirm this action.");
      if (action === "lookup") { setRecord(result.enrollment); setSchoolId(result.enrollment.schoolId ?? ""); }
      else { setMessage(result.message); setRecord(null); onSaved(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Enrollment unavailable."); } finally { setBusy(false); }
  }
  return <section className="op-panel"><h2>Student invitations & enrollment</h2><p>Manage one verified student account at a time. This does not expose chats, goals, emotional scores or attendance rosters. Do not paste consent documents, names or private notes into the review reference.</p>
    {error && <p role="alert" className="student-error">{error}</p>}{message && <p role="status" className="student-success">{message}</p>}
    <form className="student-form" onSubmit={submit}><label>Student account email<input type="email" value={email} onChange={event => { setEmail(event.target.value); setRecord(null); }} maxLength={254} autoComplete="off" required /></label><button className="student-secondary" value="lookup" formNoValidate disabled={busy}>Find enrollment</button>
    {record && <div role="status"><strong>{record.adultRole ? "Adult staff account—do not enroll" : record.status ? `Enrollment: ${record.status}` : record.found ? "Existing account, not enrolled" : "No account found"}</strong><p>{record.consentVerified ? "A consent review was recorded. Any reactivation still requires your current review." : "No verified consent is recorded. An invitation alone does not permit student use."}</p></div>}
    {record && !record.adultRole && <><label>Verified school<select value={schoolId} onChange={event => setSchoolId(event.target.value)} required><option value="">Choose a school</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Review reference ID<input name="reference" minLength={3} maxLength={200} placeholder="Reference to the approved review, not its contents" required /></label><label className="student-check"><input name="confirmed" type="checkbox" required />I verified the account and school assignment. Before activation, I also verified the approved school/guardian consent process and current student disclosures.</label><div className="student-inline">{!record.status ? <button className="student-action" value="invite" disabled={busy || schools.length === 0}>{record.found ? "Add pending enrollment" : "Send student invitation"}</button> : <><button className="student-action" value="active" disabled={busy || record.status === "active"}>Activate reviewed enrollment</button><button className="student-secondary" value="revoked" disabled={busy || record.status === "revoked"}>Revoke access, retain records</button></>}</div></>}
    </form><p className="staff-caption">No school transfer or permanent deletion is performed here. No one is automatically enrolled or approved by this release.</p></section>;
}
