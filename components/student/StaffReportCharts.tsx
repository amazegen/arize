"use client";
import { useState } from "react";
import { REPORT_TOPICS } from "@/lib/student/reporting";
import { STUDENT_TOPICS, RESET_LESSONS } from "@/lib/student/learning";
import type { StaffDashboardData } from "@/lib/student/staff";
function Plot({ rows, max, unit }: { rows: { label: string; low: number | null; high: number | null; text: string }[]; max: number; unit: string }) {
  const [selected, setSelected] = useState("");
  const inspected = rows.find((r) => r.label === selected);
  return <div><div className="staff-chart-axis" aria-hidden><span>{unit}</span><div><span>0</span><span>{Math.round(max/2)}</span><span>{max}</span></div><span /></div><div className="staff-range-rows">{rows.map((r) => <button className="staff-range-row" key={r.label} onFocus={() => setSelected(r.label)} onMouseEnter={() => setSelected(r.label)} onClick={() => setSelected(r.label)}><span className="staff-range-label">{r.label}</span><span className={`staff-range-track ${r.low === null ? "staff-range-withheld" : ""}`} aria-hidden>{r.low === null ? <span>Not available</span> : <><span className="staff-range-stem" style={{ width: `${r.low/max*100}%` }} /><span className="staff-range-interval" style={{ left: `${r.low/max*100}%`, width: `${((r.high ?? r.low)-r.low)/max*100}%`, minWidth: 3, transform: r.low === max ? "translateX(-100%)" : undefined }} /></>}</span><strong>{r.text}</strong></button>)}</div><p role="status" className="staff-chart-inspect">{inspected ? `${inspected.label}: ${inspected.text} ${inspected.low === null ? "— no eligible records or privacy withholding; not a measured zero." : unit}` : "Select a measure to inspect its reported value."}</p></div>;
}
function bands(rows: { label: string; value: string | null | undefined }[], suffix = "") {
  return rows.map((r) => { const v = r.value?.split("–").map(Number); return { label: r.label, low: v?.[0] ?? null, high: v?.[1] ?? null, text: r.value ? `${r.value}${suffix}` : "Not shown" }; });
}
function Section({ title, source, children }: { title: string; source: string; children: React.ReactNode }) {
  return <section className="staff-chart-card"><header><div><h2>{title}</h2><p>{source}</p></div><span className="staff-chart-badge">Backend data</span></header>{children}</section>;
}
export default function StaffReportCharts({ data }: { data: StaffDashboardData }) {
  const [month, setMonth] = useState(data.reports[0]?.month ?? "");
  if (data.role === "therapist") {
    const rows = ["new","acknowledged","contacted","closed"].map((s) => { const n = data.requests.filter((r) => r.stage === s).length; return { label: s.replace("_"," "), low: 0, high: n, text: String(n) }; });
    const dates = [...new Set(data.requests.map((r) => r.created_at.slice(0,10)))].sort().slice(-7);
    return <div className="staff-chart-grid"><Section title="Request follow-up" source="Current page of student-initiated requests · not a risk score"><Plot rows={rows} max={Math.max(4,data.requests.length)} unit="requests" /></Section><Section title="Requests received" source="Up to seven dates represented in the current page · not school-wide totals">{dates.length ? <Plot rows={dates.map((day) => { const n = data.requests.filter((r) => r.created_at.startsWith(day)).length; return { label: day, low: 0, high: n, text: String(n) }; })} max={Math.max(4,data.requests.length)} unit="requests" /> : <p>No requests received in this page.</p>}</Section></div>;
  }
  if (!data.reportingApproved) return <section className="student-card"><h2>School reporting is not authorized yet.</h2><p>No metrics are released until the school’s reporting scope is recorded.</p></section>;
  const selected = data.reports.find((r) => r.month === month) ?? data.reports[0];
  if (!selected) return <section className="student-card"><h2>No published report yet.</h2><p>Use the reporting tools to publish a completed month after approved data has been recorded. No sample figures are substituted.</p></section>;
  const r = selected.report; const max = Math.max(20,Number(r.cohort?.split("–")[1] ?? 49)+1);
  return <div className="staff-insights"><div className="staff-insights-toolbar"><div><strong>School pilot reports</strong><p>Saved, completed-month snapshots · count ranges, not exact student counts</p></div><label>Reporting month<select value={selected.month} onChange={(e) => setMonth(e.target.value)}>{data.reports.map((p) => <option value={p.month} key={p.month}>{p.month.slice(0,7)}</option>)}</select></label></div><p>Approved pilot cohort: {r.cohort ?? "Withheld"}. Small groups and small complements are withheld. No student-level drill-down.</p>
    <div className="staff-chart-grid"><Section title="Program participation" source="Distinct approved participants per feature; features overlap"><Plot rows={bands([{label:"Check-ins",value:r.checkins},{label:"Goal planning",value:r.goals},{label:"Clarity",value:r.clarity}])} max={max} unit="students" /></Section>
    <Section title="Voluntary topics" source="Student-selected tags; no chat scanning or raw questions"><Plot rows={bands(REPORT_TOPICS.map((id) => ({label:STUDENT_TOPICS.find((t) => t.id===id)!.label.en,value:r.topics?.[id]})))} max={max} unit="students" /></Section>
    <Section title="Belonging pulse" source="Latest response per student in the month; counts choosing 4 or 5"><Plot rows={bands([{label:"Feel welcomed",value:r.belonging?.welcome?.positive},{label:"Have a trusted adult",value:r.belonging?.trusted_adult?.positive},{label:"Feel connected",value:r.belonging?.connection?.positive}])} max={max} unit="respondents" /><p className="staff-caption">Respondent ranges: welcomed {r.belonging?.welcome?.respondents ?? "withheld"}; trusted adult {r.belonging?.trusted_adult?.respondents ?? "withheld"}; connection {r.belonging?.connection?.respondents ?? "withheld"}. No individual answers.</p></Section>
    <Section title="Recorded attendance" source="Teacher-entered present ÷ enrolled student-sessions"><Plot rows={bands([{label:"Attendance rate",value:r.attendance?.rate}],"%")} max={100} unit="%" /><p className="staff-caption">Repeated class sessions are not unique students. No named roster or relationship to individual wellbeing is inferred. This is not a measure of chronic absenteeism or proof of Arize’s effect.</p></Section>
    <Section title="Class Reset sessions" source="Teacher daily records; one selected lesson per class/day"><Plot rows={RESET_LESSONS.map((l) => { const n = r.resets?.[l.id]; return {label:l.title.en,low:n==null?null:0,high:n??null,text:n==null?"Not shown":String(n)}; })} max={Math.max(10,...Object.values(r.resets??{}).map((n)=>n??0))} unit="sessions" /></Section>
    <Section title="Ambassador program" source="School-admin-reported monthly totals; overlapping stages"><Plot rows={bands([{label:"Expressed interest",value:r.ambassadors?.interested},{label:"Orientation",value:r.ambassadors?.oriented},{label:"Active ambassadors",value:r.ambassadors?.active}])} max={max} unit="students" /><p className="staff-caption">Not an ambassador roster, service-hour certification or independently verified outcome.</p></Section></div>
  </div>;
}
