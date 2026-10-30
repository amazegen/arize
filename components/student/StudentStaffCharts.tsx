"use client";
import { useState } from "react";
import { schoolChartPreview } from "@/lib/student/chart-preview";
import type { StaffRole, SupportRequest, SchoolReport } from "@/lib/student/staff";
import StaffReportCharts from "./StaffReportCharts";

// Fictional fixtures use the exact production chart renderer, never a live fallback.
export default function StudentStaffCharts({ role, requests = [] }: { role: StaffRole; requests?: SupportRequest[] }) {
  const [suppressed, setSuppressed] = useState(false);
  const reports: SchoolReport[] = [2,1,0].map(period => {
    const d = schoolChartPreview(period); const month = `2026-${String(period+7).padStart(2,"0")}-01`;
    const band = (value: string | null) => suppressed ? null : value;
    return { month, published_at: `${month}T12:00:00Z`, report: {
      version: 2, status: suppressed ? "suppressed" : "published", minimumGroup: 10, cohort: band(d.cohort),
      checkins: band(d.participation[0].range), goals: band(d.participation[1].range), clarity: band(d.participation[2].range),
      topics: Object.fromEntries(["tests","future","relationships","social","sleep","identity","responsibilities","grief"].map((id,index) => [id,band(d.topics[index].range)])),
      belonging: Object.fromEntries(["welcome","trusted_adult","connection"].map((id,index) => [id,{ positive:band(d.belonging[index].range),respondents:band(d.respondents) }])),
      attendance: {rate:band(d.attendance[0].range)},
      resets: Object.fromEntries(["fresh-start","before-a-test","connection"].map((id,index) => [id,suppressed ? null : d.resets[index].value])),
      ambassadors: { interested:band(d.ambassadors[0].range),oriented:band(d.ambassadors[1].range),active:band(d.ambassadors[2].range) },
    } };
  });
  return <div><div className="student-note"><strong>Fictional design preview—not pilot results</strong><p>These fixtures use the same charts and definitions as the live dashboard. No live data is replaced with samples.</p>{role === "school_staff" && <label className="student-check"><input type="checkbox" checked={suppressed} onChange={event => setSuppressed(event.target.checked)} />Preview privacy-withheld values</label>}</div><StaffReportCharts preview data={{ role,schoolName:"Sample school",requests,hasMore:false,reportingApproved:true,reports }} /></div>;
}
