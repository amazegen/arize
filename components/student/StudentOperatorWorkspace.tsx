"use client";
import { useState } from "react";
import Link from "next/link";
import { LayoutDashboard, School, Users, BarChart3, MessageCircle, Settings, ArrowUpRight, Check, Plus, RefreshCw, ShieldCheck, Mail, ChevronRight, ClipboardList } from "lucide-react";
import StudentBrand from "./StudentBrand";
import StaffSignOut from "./StaffSignOut";
import StaffReportCharts from "./StaffReportCharts";
import OperatorClarityLab from "./OperatorClarityLab";
import StudentEnrollmentTools from "./StudentEnrollmentTools";
import type { OperatorOverview } from "@/lib/student/operations";
import { studentFetch } from "@/lib/student/fetch-client";
import useUnsavedForm from "./useUnsavedForm";
import { OPERATOR_VIEWS, type OperatorView, type OperatorConfig } from "@/lib/student/operator";

const sections = {
  overview: { title: "Overview", icon: LayoutDashboard, description: "Your starting point for running the student pilot." },
  schools: { title: "Schools", icon: School, description: "Set up schools and manage their approved pilot features." },
  staff: { title: "People & access", icon: Users, description: "Invite adults, review requests and manage school access." },
  reports: { title: "Reports & insights", icon: BarChart3, description: "Review protected results from completed pilot months." },
  clarity: { title: "Clarity test lab", icon: MessageCircle, description: "Try the live student coach without creating a student account." },
  settings: { title: "Settings", icon: Settings, description: "Your account, release configuration and pilot safeguards." },
};
const roleLabel = (role: string) => role === "school_staff" ? "School administrator" : role === "therapist" ? "Counselor / therapist" : "Teacher";
function Empty({ icon: Icon = ClipboardList, title, children }: { icon?: typeof ClipboardList; title: string; children: React.ReactNode }) {
  return <div className="op-empty"><span className="op-empty-icon"><Icon size={26} /></span><h3>{title}</h3><div>{children}</div></div>;
}

export default function StudentOperatorWorkspace({ initial, initialView = "overview", email, config }: { initial: OperatorOverview; initialView?: OperatorView; email: string; config: OperatorConfig }) {
  const [data, setData] = useState(initial);
  const { dirty, setDirty } = useUnsavedForm();
  const [view, setView] = useState(initialView);
  const [schoolId, setSchoolId] = useState(initial.schools[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshed, setRefreshed] = useState("");
  const school = data.schools.find(s => s.id === schoolId) ?? data.schools[0];
  const approved = data.schools.filter(s => Boolean(s.reference)).length;
  const filteredStaff = data.staff.filter(s => `${s.display_name} ${s.email} ${s.school_name} ${roleLabel(s.role)}`.toLowerCase().includes(search.toLowerCase()));
  const steps = [
    { label: "Add the pilot school", done: data.schools.length > 0, view: "schools" as const, detail: "Create a school record; collection stays off by default." },
    { label: "Invite and verify staff", done: data.kpis.approved_staff > 0, view: "staff" as const, detail: "Adults request their role. You review each assignment." },
    { label: "Record school approval", done: approved > 0, view: "schools" as const, detail: "Enable only features covered by the school’s authorization." },
    { label: "Publish the first report", done: data.kpis.published_reports > 0, view: "reports" as const, detail: "Publish a completed month after authorized data is recorded." },
  ];
  function navigate(next: OperatorView) {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    setDirty(false);
    setView(next); setError(""); setMessage("");
    window.history.replaceState(null, "", `/student/operator?view=${next}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function refresh() {
    const response = await studentFetch("/api/student/operations");
    if (!response.ok) throw new Error("Could not refresh the dashboard. Check your connection or sign in again.");
    const body = await response.json();
    if (!body.overview) throw new Error("Your project-admin access is no longer active.");
    setData(body.overview); setRefreshed(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  }
  async function reload() {
    setBusy(true); setError("");
    try { await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh."); } finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    let payload: Record<string, unknown>;
    if (action === "review") payload = { action, userId: f.get("userId"), schoolId: f.get("schoolId") || null, approve: submitter?.value === "approve", verified: f.get("verified") === "on" };
    else if (action === "revoke") payload = { action, userId: f.get("userId"), confirmed: f.get("confirmed") === "on" };
    else if (action === "school") payload = { action, name: f.get("name"), confirmed: f.get("confirmed") === "on" };
    else if (action === "invite") payload = { action, email: f.get("email"), confirmed: f.get("confirmed") === "on" };
    else if (action === "publish") payload = { action, schoolId: f.get("schoolId"), month: `${f.get("month")}-01` };
    else payload = { action, schoolId: f.get("schoolId"), reference: f.get("reference"), attendance: f.get("attendance") === "on", topics: f.get("topics") === "on", belonging: f.get("belonging") === "on", ambassadors: f.get("ambassadors") === "on", reporting: f.get("reporting") === "on", confirmed: f.get("confirmed") === "on" };
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await studentFetch(["school", "invite"].includes(action) ? "/api/student/operator" : "/api/student/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save your change.");
      setDirty(false);
      try { await refresh(); } catch { setMessage("Your change was saved, but the dashboard could not refresh. Refresh before submitting again."); return; }
      setMessage(body.message ?? (action === "publish" ? "Completed-month report published. The saved snapshot is now available below." : "Saved. Your change is active."));
      if (["school", "invite"].includes(action)) form.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); } finally { setBusy(false); }
  }
  async function copySignup() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/student/staff`); setCopied(true); }
    catch { setError("Could not copy the link. Staff can register at https://students.arizeapp.com/student/staff."); }
  }
  const metrics = [
    { label: "Pilot schools", count: data.kpis.schools, icon: School, target: "schools" as const, detail: `${approved} with an authorization reference` },
    { label: "Approved students", count: data.kpis.approved_students, icon: Users, target: "schools" as const, detail: "Active enrollment with verified consent" },
    { label: "Approved school staff", count: data.kpis.approved_staff, icon: ShieldCheck, target: "staff" as const, detail: "Project admins are counted separately" },
    { label: "Published reports", count: data.kpis.published_reports, icon: BarChart3, target: "reports" as const, detail: "Saved completed-month snapshots" },
  ];
  return <div className="staff-console operator-console" onChange={event => { if (event.target instanceof Element && event.target.closest("form") && !event.target.closest(".op-composer")) setDirty(true); }}>
    <aside className="staff-sidebar op-sidebar">
      <Link href="/student/operator" className="student-brand"><StudentBrand /></Link>
      <div className="op-workspace-label">PROJECT WORKSPACE<span>Student Edition</span></div>
      <nav aria-label="Project administration">{OPERATOR_VIEWS.map(key => { const Icon = sections[key].icon; return <button key={key} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={19} /><span>{sections[key].title}</span>{key === "staff" && data.applications.length > 0 && <b className="op-nav-count">{data.applications.length}</b>}</button>; })}</nav>
      <div className="op-sidebar-bottom"><div className="op-account"><span className="op-avatar">ML</span><div><strong>Project administrator</strong><span>{email}</span></div></div><StaffSignOut /></div>
    </aside>
    <main className="staff-content op-main">
      <div className="op-topline"><span><span className="op-live-dot" /> Live student workspace</span><div><span className="staff-role-chip">Project admin</span><button className="op-icon-button" onClick={reload} disabled={busy} aria-label="Refresh live dashboard"><RefreshCw size={17} /></button></div></div>
      <header className="op-page-heading"><div><p className="staff-eyebrow">ARIZE ADMINISTRATION</p><h1>{view === "overview" ? "Your pilot, at a glance." : sections[view].title}</h1><p>{sections[view].description}</p></div>{view === "overview" && <button className="student-action" onClick={() => navigate("staff")}><Plus size={18} /> Invite staff</button>}</header>
      {error && <p role="alert" className="student-error op-feedback">{error}</p>}{message && <p role="status" className="student-success op-feedback">{message}</p>}
      {view === "overview" && <>
        <div className="op-metrics">{metrics.map(m => <button key={m.label} className="op-metric" onClick={() => navigate(m.target)}><div><span>{m.label}</span><m.icon size={20} /></div><strong>{m.count}</strong><small>{m.detail}</small></button>)}</div>
        <div className="op-overview-grid"><section className="op-panel"><div className="op-panel-heading"><div><h2>Get your pilot ready</h2><p>{steps.filter(s => s.done).length} of 4 setup milestones complete</p></div><span className="op-soft-chip">Setup checklist</span></div><div className="op-progress" aria-label={`${steps.filter(s => s.done).length} of 4 setup milestones complete`}><span style={{ width: `${steps.filter(s => s.done).length * 25}%` }} /></div><div className="op-checklist">{steps.map((step, i) => <button key={step.label} onClick={() => navigate(step.view)}><span className={step.done ? "op-step done" : "op-step"}>{step.done ? <Check size={17} /> : i + 1}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div><ChevronRight size={18} /></button>)}</div></section>
        <div className="op-right-stack"><section className="op-lab-card"><MessageCircle size={26} /><span>NO STUDENT ACCOUNT NEEDED</span><h2>Meet your student coach.</h2><p>Try Clarity in English or Spanish with fictional examples. Test chats stay out of student history and pilot reports.</p><button className="student-action" onClick={() => navigate("clarity")}>Open Clarity test lab <ArrowUpRight size={18} /></button></section><section className="op-panel"><div className="op-panel-heading"><h2>Needs your attention</h2><span className="op-soft-chip">{data.applications.length}</span></div><p>{data.applications.length ? `${data.applications.length} staff access requests are waiting for review.` : "No staff access requests are waiting. Start by inviting your school lead or counselor."}</p><button className="op-text-button" onClick={() => navigate("staff")}>Manage people <ChevronRight size={16} /></button></section></div></div>
        <section className="op-panel op-privacy-strip"><ShieldCheck size={25} /><div><h3>Useful data. Clear boundaries.</h3><p>See approved program reports—not private student chats, emotional scores or named attendance. Reports appear when authorized data is available, never as sample figures.</p></div><button className="op-text-button" onClick={() => navigate("settings")}>View safeguards</button></section>
      </>}
      {view === "schools" && <div className="op-management-grid"><section className="op-panel"><div className="op-panel-heading"><div><h2>Your schools</h2><p>{data.schools.length} school records</p></div><School size={23} /></div>{data.schools.length ? <div className="op-school-list">{data.schools.map(s => <button className={school?.id === s.id ? "selected" : ""} key={s.id} onClick={() => setSchoolId(s.id)}><span className="op-school-icon"><School size={21} /></span><div><strong>{s.name}</strong><small>{s.reference ? "Authorization recorded" : "Awaiting school authorization"}</small></div><ChevronRight size={17} /></button>)}</div> : <Empty icon={School} title="Add your first pilot school"><p>Creating a school gives staff a place to be assigned. It does not activate collection or enroll students.</p></Empty>}
        <details className="op-details" open={!data.schools.length}><summary><Plus size={17} /> Add a school</summary><form className="student-form" onSubmit={e => submit(e, "school")}><label>School display name<input name="name" minLength={2} maxLength={160} required placeholder="Enter the school’s actual name" /></label><label className="student-check"><input type="checkbox" name="confirmed" required />This is a school record, not a student or classroom name.</label><button className="student-action" disabled={busy}>Add school</button></form></details></section>
        <section className="op-panel"><div className="op-panel-heading"><div><h2>Approved features</h2><p>{school?.name ?? "Select or add a school to begin"}</p></div><ShieldCheck size={23} /></div>{!school ? <Empty icon={ShieldCheck} title="Approval comes before collection"><p>Add the school on the left, then record its agreement and select only the features it has approved.</p></Empty> : <form key={`${school.id}:${JSON.stringify(school.scope)}`} className="student-form" onSubmit={e => submit(e, "authorize")}><input name="schoolId" type="hidden" value={school.id} /><label>School agreement / authorization reference<input name="reference" required minLength={3} maxLength={200} defaultValue={school.reference ?? ""} placeholder="Agreement reference—no student information" /></label><div className="op-feature-options">{([["attendance", "Attendance & Class Reset", "Teacher-entered class totals and lesson logs"], ["topics", "Voluntary topic choices", "Student-selected interests, not chat analysis"], ["belonging", "Optional belonging pulse", "Voluntary survey with protected reporting"], ["ambassadors", "Ambassador program", "School-entered monthly program totals"], ["reporting", "School reports", "Protected completed-month snapshots"]] as const).map(([key, label, detail]) => <label key={key}><input name={key} type="checkbox" defaultChecked={school.scope[key]} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div><label className="student-check"><input name="confirmed" type="checkbox" required />I verified the school’s authorization, approved audience and applicable consent/retention arrangements.</label><button className="student-action" disabled={busy}>Save approved features</button><p className="staff-caption">Unchecked features stay off. Disabling reporting removes report access. This record is not a legal certification.</p></form>}</section></div>}
      {view === "staff" && <>
        <div className="op-management-grid"><section className="op-panel"><div className="op-panel-heading"><div><h2>Invite an adult staff member</h2><p>Send the branded Arize password-setup email.</p></div><Mail size={23} /></div><form className="student-form" onSubmit={e => submit(e, "invite")}><label>Work email<input name="email" type="email" maxLength={254} required placeholder="name@school.org" /></label><label className="student-check"><input name="confirmed" type="checkbox" required />I verified this email belongs to the adult I intend to invite.</label><button className="student-action" disabled={busy}>Send invitation</button></form><p className="staff-caption">No role is granted by email. The recipient sets a password, requests a role and waits for your approval.</p><button className="op-text-button" onClick={copySignup}>{copied ? "Staff registration link copied" : "Copy staff registration link"}</button></section>
        <section className="op-panel"><h2>Separate workspaces, clear access</h2><ul className="op-role-guide"><li><School size={20} /><div><strong>School administrator</strong><p>Approved school reports and ambassador totals.</p></div></li><li><Users size={20} /><div><strong>Teacher</strong><p>Own classes, attendance totals and Class Reset logs.</p></div></li><li><MessageCircle size={20} /><div><strong>Counselor / therapist</strong><p>Student-requested contact, follow-up and notification settings.</p></div></li></ul><p className="staff-caption">Your project-admin role is separate. You are not enrolled as a student or assigned as a school counselor.</p></section></div>
        <section className="op-panel"><div className="op-panel-heading"><div><h2>Access requests</h2><p>Up to 50 pending adult requests. Verify identity and school authority before approval.</p></div><span className="op-soft-chip">{data.applications.length} pending</span></div>{data.applications.length === 0 ? <Empty icon={ShieldCheck} title="You’re caught up"><p>New requests appear here after invited staff complete their profile. You can refresh the dashboard to check for updates.</p></Empty> : data.applications.map(a => <form className="student-form op-access-request" key={a.user_id} onSubmit={e => submit(e, "review")}><div><h3>{a.display_name}</h3><p>{a.email} · {roleLabel(a.requested_role)} · {a.school_name}</p></div><input name="userId" type="hidden" value={a.user_id} /><label>School assignment<select name="schoolId" required={a.requested_role !== "school_staff"}><option value="">{a.requested_role === "school_staff" ? "Create the school in this request" : "Choose an existing school"}</option>{data.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="student-check"><input name="verified" type="checkbox" />I verified this adult’s identity, school authority and requested role.</label><div className="student-inline"><button className="student-action" value="approve" disabled={busy}>Approve role</button><button className="student-secondary" value="decline" formNoValidate disabled={busy}>Decline</button></div></form>)}</section>
        <section className="op-panel"><div className="op-panel-heading"><div><h2>Approved school staff</h2><p>Up to 100 active school-role accounts. Project admins are separate.</p></div><label className="op-search"><span className="sr-only">Search staff</span><input type="search" placeholder="Search staff or school" value={search} onChange={e => setSearch(e.target.value)} /></label></div>{filteredStaff.length ? filteredStaff.map(s => <details className="op-details" key={s.user_id}><summary><span><strong>{s.display_name ?? s.email ?? "Approved staff"}</strong><small>{roleLabel(s.role)} · {s.school_name}</small></span><span className="op-soft-chip">Active</span></summary><form className="student-form" onSubmit={e => submit(e, "revoke")}><p>{s.email}</p><input name="userId" type="hidden" value={s.user_id} /><label className="student-check"><input name="confirmed" type="checkbox" required />Remove this account’s school-role access on its next request. Keep the account and records.</label><button className="student-secondary" disabled={busy}>Revoke school access</button></form></details>) : <Empty icon={Users} title={search ? "No matching staff" : "No school staff approved yet"}><p>{search ? "Try another name, email or school." : "Invite staff above, then review their role request. Your own project-admin access is already active."}</p></Empty>}</section>
      </>}
      {view === "reports" && <>
        <section className="op-panel"><div className="op-panel-heading"><div><h2>School reporting</h2><p>Current approved snapshots—never simulated pilot results.</p></div>{school && <label className="op-school-select">School<select value={school.id} onChange={e => setSchoolId(e.target.value)}>{data.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div>{!school ? <Empty icon={BarChart3} title="Your first report starts with a school"><p>Add a school, verify its reporting scope and collect authorized pilot data before publishing a completed month.</p><button className="student-action" onClick={() => navigate("schools")}>Set up a school</button></Empty> : !school.scope.reporting ? <Empty icon={ShieldCheck} title="Reporting needs school authorization"><p>No school metrics are released until reporting is approved for {school.name}.</p><button className="student-action" onClick={() => navigate("schools")}>Review approved features</button></Empty> : <><form className="op-publish-form" onSubmit={e => submit(e, "publish")}><input type="hidden" name="schoolId" value={school.id} /><label>Completed month<input name="month" type="month" required max={new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString("en-CA").slice(0, 7)} /></label><button className="student-action" disabled={busy}>Publish month</button></form><p className="staff-caption">Publishing freezes that month’s snapshot. Small groups are withheld; missing values are not measured zeros.</p>{data.reports.some(r => r.schoolId === school.id) ? <StaffReportCharts key={school.id} data={{ role: "school_staff", schoolName: school.name, requests: [], hasMore: false, reportingApproved: true, reports: data.reports.filter(r => r.schoolId === school.id) }} /> : <Empty icon={BarChart3} title="No published report for this school yet"><p>Publish an eligible completed month above. Reports cover participation, voluntary topics, belonging, class attendance, Class Reset and ambassador totals when authorized data exists.</p></Empty>}</>}</section>
        <details className="op-panel op-details"><summary>How to read these reports</summary><p>Figures describe recorded program activity, not proof that Arize caused an outcome. Counts may be displayed as privacy-protective ranges. Public case studies require a separate approved disclosure and evaluation process. No student-level drill-down is available.</p></details>
      </>}
      {view === "clarity" && <OperatorClarityLab config={config} />}
      {view === "staff" && (config.enrollmentManagementReady ? <StudentEnrollmentTools schools={data.schools} onSaved={() => { setDirty(false); void reload(); }} /> : <section className="op-panel"><h2>Student enrollment management</h2><p>The new controls are built, but their backend permissions are awaiting approval. No student invitation or enrollment change is enabled here yet.</p></section>)}
      {view === "settings" && <div className="op-management-grid"><section className="op-panel"><h2>Your account</h2><dl className="op-settings-list"><div><dt>Email</dt><dd>{email}</dd></div><div><dt>Role</dt><dd>Project administrator</dd></div><div><dt>Workspace</dt><dd>Arize Student Edition</dd></div></dl><Link className="student-action" href="/student/account-setup">Change your password <ArrowUpRight size={16} /></Link><p className="staff-caption">Supabase, Vercel and adult-app billing accounts are not managed through this dashboard.</p></section><section className="op-panel"><h2>Release configuration</h2><dl className="op-settings-list"><div><dt>Student Clarity</dt><dd>{config.aiEnabled && config.aiConfigured ? "Enabled · configured" : "Not enabled"}</dd></div><div><dt>Staff self-registration</dt><dd>{config.staffSignupEnabled ? "Enabled · approval required" : "Disabled"}</dd></div><div><dt>Counselor email sending</dt><dd>{config.counselorSendingEnabled ? "Enabled" : "Off · delivery activation pending"}</dd></div><div><dt>Coaching model</dt><dd>{config.model ?? "Not configured"}</dd></div><div><dt>Writing configuration</dt><dd>{config.promptVersion}</dd></div></dl><p className="staff-caption">Configuration reflects this release, not an ongoing service-health guarantee. Secrets are never displayed here.</p></section><section className="op-panel op-wide"><h2>Privacy & operating boundaries</h2><div className="op-safeguard-grid"><div><ShieldCheck size={23} /><h3>Private student activity</h3><p>Project administration does not expose private chats, individual emotional scores or named attendance.</p></div><div><Users size={23} /><h3>Verified adult roles</h3><p>School staff, teachers and counselors have separate permissions. Registration alone grants none of them.</p></div><div><BarChart3 size={23} /><h3>Approved reporting</h3><p>School authorization, consent, completed periods and small-group privacy protections control report availability.</p></div></div><div className="student-privacy-links"><a href="https://amazegen.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a><a href="https://amazegen.com/terms.html" target="_blank" rel="noopener noreferrer">Terms of use</a></div></section></div>}
      {view === "settings" && <div className="op-panel"><h2>End this session</h2><p>Sign out when you’re finished on a shared device.</p><StaffSignOut /></div>}
      <footer className="op-footer"><span>Arize · Student Edition · Project administration</span><span>{refreshed ? `Last refreshed ${refreshed}` : "Live backend records"}</span></footer>
    </main>
  </div>;
}
