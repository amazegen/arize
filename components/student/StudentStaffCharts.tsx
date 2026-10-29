"use client";

import { useId, useState } from "react";
import { BarChart3, Users, HeartHandshake, CalendarDays, BookOpen, Sprout } from "lucide-react";
import { PREVIEW_MONTHS, rangeBounds, schoolChartPreview, type RangeRow } from "@/lib/student/chart-preview";
import type { StaffRole, SupportRequest } from "@/lib/student/staff";

function RangeChart({ rows, max = 50, unit = "students", hidden = false }: { rows: RangeRow[]; max?: number; unit?: string; hidden?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const id = useId();
  const visible = rows.map((row) => ({ ...row, range: hidden ? null : row.range }));
  const inspected = visible.find((row) => row.label === selected);
  return <div className="staff-chart-plot">
    <div className="staff-chart-axis" aria-hidden><span>{unit}</span><div><span>0</span><span>{max / 2}</span><span>{max}</span></div><span /></div>
    <div className="staff-range-rows">{visible.map((row) => {
      const bounds = rangeBounds(row.range);
      return <button className="staff-range-row" key={row.label} onFocus={() => setSelected(row.label)} onMouseEnter={() => setSelected(row.label)} onClick={() => setSelected(row.label)} aria-describedby={selected === row.label ? id : undefined}>
        <span className="staff-range-label">{row.label}</span>
        <span className={`staff-range-track ${bounds ? "" : "staff-range-withheld"}`} aria-hidden>
          {bounds ? <><span className="staff-range-stem" style={{ width: `${bounds[0] / max * 100}%` }} /><span className="staff-range-interval" style={{ left: `${bounds[0] / max * 100}%`, width: `${(bounds[1] - bounds[0]) / max * 100}%` }} /></> : <span>Withheld</span>}
        </span><strong>{row.range ?? "Not shown"}{bounds && unit === "%" ? "%" : ""}</strong>
      </button>;
    })}</div>
    <p className="staff-chart-inspect" id={id} role="status">{inspected ? inspected.range ? `${inspected.label}: ${inspected.range}${unit === "%" ? "%" : ` ${unit}`}. The marked interval is a reported range—not an exact count or confidence interval.` : `${inspected.label}: withheld in this example. Missing values are not zero.` : "Select a row to inspect its reported range."}</p>
    <details className="staff-chart-source"><summary>Values & definition</summary><table><caption>Fictional design data · no live source connected</caption><thead><tr><th scope="col">Measure</th><th scope="col">Range ({unit})</th></tr></thead><tbody>{visible.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.range ?? "Withheld"}</td></tr>)}</tbody></table></details>
  </div>;
}
function CountChart({ rows, unit, max }: { rows: { label: string; value: number }[]; unit: string; max: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="staff-chart-plot"><div className="staff-chart-axis" aria-hidden><span>{unit}</span><div><span>0</span><span>{max / 2}</span><span>{max}</span></div><span /></div><div className="staff-range-rows">{rows.map((r) => <button key={r.label} className="staff-range-row" onClick={() => setSelected(r.label)} onFocus={() => setSelected(r.label)} onMouseEnter={() => setSelected(r.label)}><span className="staff-range-label">{r.label}</span><span className="staff-range-track" aria-hidden><span className="staff-count-bar" style={{ width: `${r.value / max * 100}%` }} /></span><strong>{r.value}</strong></button>)}</div><p role="status" className="staff-chart-inspect">{selected ? `${selected}: ${rows.find((r) => r.label === selected)!.value} ${unit}.` : `Select a bar to inspect its ${unit}.`}</p></div>;
}
function ChartCard({ icon: Icon, title, subtitle, badge, children, note }: { icon: typeof BarChart3; title: string; subtitle: string; badge?: string; children: React.ReactNode; note: string }) {
  return <section className="staff-chart-card"><header><span className="staff-chart-icon"><Icon size={22} aria-hidden /></span><div><h2>{title}</h2><p>{subtitle}</p></div>{badge && <span className="staff-chart-badge">{badge}</span>}</header>{children}<p className="staff-chart-note">{note}</p></section>;
}
export default function StudentStaffCharts({ role, requests = [] }: { role: StaffRole; requests?: SupportRequest[] }) {
  const [period, setPeriod] = useState(2);
  const [state, setState] = useState("sample");
  const [topicMode, setTopicMode] = useState("current");
  const [allTopics, setAllTopics] = useState(false);
  const data = schoolChartPreview(period);
  const hidden = state === "small";
  const school = role === "school_staff";
  const stages = ["new", "acknowledged", "contacted", "closed"] as const;
  const labels = ["New", "Acknowledged", "Contact made", "Closed"];
  if (!school) return <div id="staff-request-charts" className="staff-chart-grid staff-therapist-charts">
    <ChartCard icon={HeartHandshake} title="Contact-request workflow" subtitle="Current sample request page · operational status only" badge="Sample data" note="These are requests students chose to send—not inferred needs, diagnoses or student risk scores. Counts cover only this page.">
      <CountChart rows={stages.map((stage, i) => ({ label: labels[i], value: requests.filter((r) => r.stage === stage).length }))} unit="requests" max={Math.max(4, requests.length)} />
    </ChartCard>
    <ChartCard icon={CalendarDays} title="Requests received" subtitle="October 26–28, 2026 · current sample page" badge="Sample data" note="A request count is not a count of unique students. This chart does not analyze private conversations or monitor students.">
      <CountChart rows={[26, 27, 28].map((day) => ({ label: `Oct ${day}`, value: requests.filter((r) => r.created_at.slice(0, 10) === `2026-10-${day}`).length }))} unit="requests" max={Math.max(4, requests.length)} />
    </ChartCard>
  </div>;
  return <div id="pilot-insights" className="staff-insights">
    <div className="staff-insights-toolbar"><div><strong>Pilot insights</strong><p>Design review · Every chart below uses fictional data.</p></div><div className="staff-insights-selects"><label>Example month<select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>{PREVIEW_MONTHS.map((month, i) => <option key={month} value={i}>{month}</option>)}</select></label><label>Preview state<select value={state} onChange={(e) => setState(e.target.value)}><option value="sample">Larger sample cohort</option><option value="small">Small pilot · protect results</option><option value="empty">No approved data yet</option></select></label></div></div>
    {state === "empty" ? <section className="staff-chart-card"><h2>No approved reports yet.</h2><p>No results are connected. This is an unavailable-data state, not zero participation.</p></section> : <>
      <div className="staff-insights-summary"><div><span>Example cohort</span><strong>{hidden ? "Withheld" : data.cohort}</strong><small>Approved student count range</small></div><div><span>Reporting window</span><strong>{data.period}</strong><small>Completed calendar month</small></div><div><span>Data connection</span><strong>Design only</strong><small>No student records or tracking added</small></div></div>
      <div className="staff-chart-grid">
        <ChartCard icon={Users} title="Program participation" subtitle={`${data.period} · cohort ${hidden ? "withheld" : data.cohort}`} badge="Existing report fields" note="Distinct participants per feature. Features overlap, so counts must not be added. Dashed stems lead to reported count intervals; no exact counts are inferred.">
          <RangeChart rows={data.participation} hidden={hidden} />
          <div className="staff-chart-history"><strong>Monthly check-in participation</strong><div>{PREVIEW_MONTHS.map((month, i) => <button key={month} aria-pressed={period === i} onClick={() => setPeriod(i)}><span>{month.split(" ")[0]}</span><b>{hidden ? "Withheld" : schoolChartPreview(i).participation[0].range}</b></button>)}</div></div>
        </ChartCard>
        <ChartCard icon={BarChart3} title="Topics students choose" subtitle={`${data.period} · voluntary topic selection concept`} badge="Proposed · not collected" note="A proposed voluntary topic-tag feature—not chat scanning. Students may select multiple topics. Small categories stay hidden. Collection and release need separate approval.">
          <div className="staff-chart-toggle" aria-label="Topic chart scope"><button aria-pressed={topicMode === "current"} onClick={() => setTopicMode("current")}>Selected month</button><button aria-pressed={topicMode === "compare"} onClick={() => setTopicMode("compare")}>Compare months</button></div>
          {topicMode === "current" ? <><RangeChart rows={allTopics ? data.topics : data.topics.slice(0, 5)} hidden={hidden} /><button className="staff-chart-more" onClick={() => setAllTopics((v) => !v)}>{allTopics ? "Show five categories" : "Show all eight categories"}</button></> : <RangeChart rows={PREVIEW_MONTHS.map((month, i) => ({ label: `Test stress · ${month.split(" ")[0]}`, range: schoolChartPreview(i).topics[0].range }))} hidden={hidden} />}
        </ChartCard>
        <ChartCard icon={HeartHandshake} title="Belonging pulse" subtitle={`${data.period} · example respondents ${hidden ? "withheld" : data.respondents}`} badge="Proposed aggregate view" note="Example counts selecting 4 or 5 on each optional 1–5 question. No individual answers, emotional scores or student-level drill-down. Staff aggregation is not connected or approved.">
          <RangeChart rows={data.belonging} hidden={hidden} />
        </ChartCard>
        <ChartCard icon={CalendarDays} title="School attendance context" subtitle={`${data.period} · school-level rates only`} badge="Concept · no import" note="Illustrative school-supplied attendance bands, not Arize student records. No individual attendance linkage exists. These examples do not demonstrate improvement or an effect of Arize.">
          <RangeChart rows={data.attendance} max={100} unit="%" hidden={hidden} />
        </ChartCard>
        <ChartCard icon={BookOpen} title="Class Reset activity" subtitle={`${data.period} · example facilitator-reported sessions`} badge="Concept · not tracked" note="Counts represent classroom sessions—not students or personal responses. The current Class Reset runs without collecting usage. A future facilitator log would need approval.">
          {hidden ? <p className="staff-chart-inspect">No activity figures are released in the small-pilot example.</p> : <CountChart rows={data.resets} unit="sessions" max={10} />}
        </ChartCard>
        <ChartCard icon={Sprout} title="Wellness ambassador pathway" subtitle={`${data.period} · example program participation`} badge="Concept · not built" note="Stage counts overlap and are not additive. Recruitment, orientation, safeguarding and service-hour eligibility still need a school-approved program; no hours are certified here.">
          <RangeChart rows={data.ambassadors} hidden={hidden} />
        </ChartCard>
      </div>
    </>}
    <details className="staff-chart-source"><summary>What is real, proposed and protected?</summary><p>The reporting backend currently supports approved monthly participation ranges only. Topic tags, staff belonging summaries, attendance imports, Class Reset tracking and ambassador administration are local design concepts—not completed data integrations. The small-pilot control demonstrates withholding; it is not a legal anonymity test. All sample figures are hand-authored in the development-only chart fixtures.</p></details>
  </div>;
}
