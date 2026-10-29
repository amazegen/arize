"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Inbox, BookOpen, ShieldCheck, BarChart3, Settings, ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";
import StudentBrand from "./StudentBrand";
import StudentStaffCharts from "./StudentStaffCharts";
import { createClient } from "@/lib/supabase/client";
import { RESET_LESSONS } from "@/lib/student/learning";
import { FOLLOWUP_STAGES, type StaffDashboardData, type FollowupStage, type SupportRequest } from "@/lib/student/staff";

const stageLabels = { new: "New request", acknowledged: "Acknowledged", contacted: "Contact made", closed: "Closed" };
export default function StudentStaffDashboard({ initial, preview = false }: { initial: StaffDashboardData; preview?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, FollowupStage>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [smallExample, setSmallExample] = useState(false);
  const therapist = data.role === "therapist";
  const menu = therapist
    ? [["overview", "Your workspace", LayoutDashboard], ["requests", "Support requests", Inbox], ["resources", "Classroom resources", BookOpen], ["privacy", "Privacy & access", ShieldCheck]] as const
    : [["overview", "Program overview", LayoutDashboard], ["reports", "School reports", BarChart3], ["resources", "Classroom resources", BookOpen], ["privacy", "Privacy & access", ShieldCheck]] as const;

  async function save(request: SupportRequest) {
    const stage = drafts[request.id] ?? request.stage;
    setBusy(request.id); setError(""); setMessage("");
    try {
      if (!preview) {
        const response = await fetch("/api/student/admin/dashboard", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: request.id, stage }) });
        if (!response.ok) throw new Error("The change could not be saved. Reload and check your staff access.");
      }
      setData((current) => ({ ...current, requests: current.requests.map((r) => r.id === request.id ? { ...r, stage, updated_at: new Date().toISOString() } : r) }));
      setMessage(preview ? "Sample follow-up updated. No real request was changed." : "Follow-up status saved. No email or message was sent.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the change."); }
    finally { setBusy(null); }
  }
  async function page(next: number) {
    setBusy("page"); setError("");
    try {
      const response = await fetch(`/api/student/admin/dashboard?offset=${next}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load this page. Please check your staff access.");
      setData(await response.json()); setOffset(next); setDrafts({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load requests."); }
    finally { setBusy(null); }
  }
  const shown = data.requests.filter((r) => filter === "all" || r.stage === filter);
  const reports = smallExample ? data.reports.map((r) => ({ ...r, report: { ...r.report, cohort: null, checkins: null, goals: null, clarity: null, status: "suppressed" } })) : data.reports;
  async function signOut() {
    setBusy("signout"); setError("");
    try {
      const result = await createClient().auth.signOut();
      if (result.error) throw new Error("Sign-out could not be completed. Please try again.");
      router.replace("/student/sign-in?next=%2Fstudent%2Fadmin");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); setBusy(null); }
  }
  return (
    <div className={`staff-console${preview ? " staff-design-review" : ""}`}>
      <aside className="staff-sidebar">
        <Link className="student-brand" href={preview ? "/student-design?screen=home" : "/student/admin"}><StudentBrand /></Link>
        <div className="staff-role"><span className="staff-eyebrow">YOUR WORKSPACE</span><strong>{therapist ? "Therapist / counselor" : "School partner"}</strong><span>{data.schoolName}</span></div>
        <nav aria-label="Staff dashboard sections">{menu.map(([key, label, Icon]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setMessage(""); setError(""); }}><Icon size={20} aria-hidden />{label}</button>)}</nav>
        {therapist && <Link className="staff-settings-link" href={preview ? "/student-design?screen=admin-notifications" : "/student/admin/notifications"}><Settings size={19} aria-hidden />Notification settings<ArrowUpRight size={16} aria-hidden /></Link>}
        {!preview && <button className="staff-settings-link staff-signout" disabled={busy !== null} onClick={signOut}>{busy === "signout" ? "Signing out…" : "Sign out"}</button>}
        <div className="staff-sidebar-note"><ShieldCheck size={22} aria-hidden /><p>{therapist ? "Requests are shared by the student. This is not a live monitoring system." : "Program-level information only. No access to individual student wellness activity."}</p></div>
      </aside>
      <main className="staff-content">
        <header className="staff-topline"><span>{therapist ? "STUDENT SUPPORT" : "SCHOOL PARTNERSHIPS"}</span><span className="staff-role-chip">{preview ? "Sample-data preview" : "School-scoped access"}</span></header>
        {preview && <div className="staff-preview-note"><strong>Review mode · Synthetic data only.</strong> Role selection is available only in this local mockup. Live permissions are assigned on the server, never by a browser dropdown.</div>}
        <div className="staff-page-heading"><p className="staff-eyebrow">{data.schoolName}</p><h1>{tab === "overview" ? (therapist ? "Support starts with a request." : "A clearer view of your pilot.") : tab === "requests" ? "Student-initiated support" : tab === "reports" ? "Privacy-protected school reports" : tab === "resources" ? "Tools for the school day" : "Clear boundaries. Safer access."}</h1><p>{therapist ? "Help students connect with a person—without turning their private activity into a caseload." : "Understand program reach without identifying how an individual student feels or what they share."}</p></div>
        {error && <p role="alert" className="student-error">{error}</p>}{message && <p role="status" className="student-success">{message}</p>}
        {preview && (tab === "overview" || (!therapist && tab === "reports")) && <StudentStaffCharts role={data.role} requests={data.requests} />}
        {tab === "overview" && therapist && <>
          {!preview && <div className="staff-metric-grid">{[["New requests", data.requests.filter((r) => r.stage === "new").length], ["Awaiting contact", data.requests.filter((r) => r.stage === "acknowledged").length], ["Contact made", data.requests.filter((r) => r.stage === "contacted").length]].map(([label, count]) => <section className="staff-metric" key={label}><span>{label}</span><strong>{count}</strong><small>In the current request page—not a school-wide risk measure</small></section>)}</div>}
          <section className="staff-feature-card"><div><span className="staff-eyebrow">YOUR NEXT ACTION</span><h2>Meet the students who chose to reach out.</h2><p>Review the request, use your school’s established contact process, then record a simple follow-up status. No clinical notes are entered here.</p><button className="student-action" onClick={() => setTab("requests")}>Open support requests <ArrowUpRight size={18} aria-hidden /></button></div><Inbox size={70} aria-hidden /></section>
          <section className="student-card"><h2>What this workspace does not tell you</h2><p>It does not score risk, diagnose, show private AI conversations, or report which students use check-ins and goals. No request does not mean a student is safe or does not need support.</p></section>
        </>}
        {tab === "requests" && therapist && <>
          <div className="staff-request-controls"><label>Show requests in this page<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All follow-up statuses</option>{FOLLOWUP_STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}</select></label><span>Page {offset / 50 + 1} · Up to 50 requests</span></div>
          <p className="staff-caption">A delivery receipt means the email service accepted the message—not that a counselor read it. This queue is not monitored for emergencies.</p>
          <div className="staff-request-list">{shown.length ? shown.map((r) => <article className="student-card staff-request" key={r.id}>
            <div className="staff-request-title"><div><span className="staff-eyebrow">STUDENT REQUESTED CONTACT</span><h2>{r.display_name}</h2><p>Requested <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time></p></div><span className={`staff-status staff-status-${r.stage}`}>{stageLabels[r.stage]}</span></div>
            <p className="staff-caption">Email: {r.delivery_status === "sent" ? "Accepted by provider" : r.delivery_status === "failed" ? "Delivery not confirmed—follow school contact process" : "Pending confirmation"} · Reference {r.id}</p>
            <div className="staff-followup"><label>Follow-up status<select aria-label={`Follow-up status for ${r.display_name}`} value={drafts[r.id] ?? r.stage} onChange={(e) => setDrafts((current) => ({ ...current, [r.id]: e.target.value as FollowupStage }))}>{FOLLOWUP_STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}</select></label><button className="student-action" disabled={busy !== null || (drafts[r.id] ?? r.stage) === r.stage} onClick={() => save(r)}>{busy === r.id ? "Saving…" : "Save follow-up"}</button></div>
          </article>) : <section className="student-card"><h2>No requests match this view.</h2><p>Only requests a student chooses to submit appear here. Private activity is never scanned to create a request.</p></section>}</div>
          {!preview && <div className="student-inline"><button className="student-secondary" disabled={offset === 0 || busy !== null} onClick={() => page(Math.max(0, offset - 50))}>Previous page</button><button className="student-secondary" disabled={!data.hasMore || busy !== null} onClick={() => page(offset + 50)}>Next page</button></div>}
        </>}
        {(tab === "overview" || tab === "reports") && !therapist && !preview && <>
          <section className="staff-feature-card"><div><span className="staff-eyebrow">PROGRAM REPORTING</span><h2>Useful summaries. No student-level drill-down.</h2><p>Reports use completed calendar months, frozen snapshots and count ranges. Small groups and small complementary groups are withheld. No live heat map, student ranking or individual risk flags.</p></div><BarChart3 size={70} aria-hidden /></section>
          {preview && <button className="student-secondary" onClick={() => setSmallExample((v) => !v)}>{smallExample ? "Show larger sample cohort" : "See small-pilot privacy protection"}</button>}
          {!data.reportingApproved ? <section className="student-card"><h2>Reporting is awaiting school approval.</h2><p>No school metrics are being released. Approval, the reporting purpose and the permitted audience must be recorded before publication.</p></section> : !reports.length ? <section className="student-card"><h2>No published report yet.</h2><p>Reports appear after an approved, completed reporting period. This does not mean zero participation.</p></section> : reports.map((r) => <section className="student-card staff-report" key={r.month}><div className="staff-request-title"><div><span className="staff-eyebrow">COMPLETED REPORTING PERIOD</span><h2>{new Date(`${r.month}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2></div><span className="staff-role-chip">{r.report.status === "suppressed" ? "Small cohort · protected" : "Published snapshot"}</span></div>
            <div className="staff-metric-grid">{[["Approved pilot cohort", r.report.cohort], ["Check-in participation", r.report.checkins], ["Goal-planning participation", r.report.goals], ["Clarity participation", r.report.clarity]].map(([label, value]) => <div className="staff-metric" key={label}><span>{label}</span><strong>{value ?? "Not shown"}</strong><small>{value ? "Participant range—not individual activity" : "Withheld to protect a small group or its complement"}</small></div>)}</div>
            <p className="staff-caption">No names, chats, emotional scores, diagnosis, demographic filters or student exports. A threshold is a product safeguard, not a guarantee of legal de-identification. These reports do not measure attendance or prove an effect on attendance.</p>
          </section>)}
          <section className="student-card"><h2>What staff can act on</h2><ul className="staff-bullet-list"><li>Make classroom resources easy to find.</li><li>Discuss program adoption using the approved aggregate report.</li><li>Gather voluntary product feedback through the approved process.</li><li>Use existing school support procedures—not app-generated student risk labels.</li></ul></section>
        </>}
        {tab === "resources" && <div className="staff-resource-grid">{RESET_LESSONS.map((lesson) => <section className="student-card" key={lesson.id}><BookOpen size={26} aria-hidden /><h2>{lesson.title.en}</h2><p>Five-minute advisory activity · English and Spanish. Students can participate quietly, adapt the activity or pass.</p><Link className="student-action" href="/student/class-reset" target="_blank" rel="noopener noreferrer">Open Class Reset <ArrowUpRight size={17} aria-hidden /></Link><p className="staff-caption">No participation, attendance or personal responses are recorded.</p></section>)}</div>}
        {tab === "privacy" && <div className="staff-resource-grid"><section className="student-card"><ShieldCheck size={27} aria-hidden /><h2>Your permitted view</h2><ul className="staff-bullet-list">{(therapist ? ["Student-initiated requests within your assigned school.", "Preferred name, request reference, time and delivery state only.", "Operational follow-up status, with an audit trail.", "Counselor notification destination settings."] : ["Approved, completed-period school reports only.", "Small groups and small complements are withheld.", "Classroom resources without student participation tracking.", "No student roster, support-request inbox or individual wellness records."]).map((s) => <li key={s}>{s}</li>)}</ul></section><section className="student-card"><Clock3 size={27} aria-hidden /><h2>Before real-school use</h2><ul className="staff-bullet-list"><li>School data agreement, disclosure/consent basis and audience approval.</li><li>Verified staff role, school scope and approved contact process.</li><li>Retention, deletion, incident response and professional escalation procedures.</li><li>Separate legal/provider review before adding clinical records or treatment workflows.</li></ul><p className="staff-caption">Arize is not an emergency monitoring or clinical-record system. Contacting a therapist does not automatically share private app history.</p></section><section className="student-card"><CheckCircle2 size={27} aria-hidden /><h2>Access is checked on the server.</h2><p>Roles are assigned by a trusted operator. Changing a URL, choosing a grade or editing a profile cannot grant staff access. Revoked accounts lose access on the next request.</p><a href="https://amazegen.com/privacy.html" target="_blank" rel="noopener noreferrer">Read the privacy policy <ArrowUpRight size={16} aria-hidden /></a></section></div>}
      </main>
    </div>
  );
}
