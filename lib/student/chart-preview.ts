// Design fixtures only. No student records, query results or measured outcomes.
export const PREVIEW_MONTHS = ["July 2026", "August 2026", "September 2026"] as const;
export type RangeRow = { label: string; range: string | null };
export function rangeBounds(value: string | null): [number, number] | null {
  if (!value || !/^\d+–\d+$/.test(value)) return null;
  const [low, high] = value.split("–").map(Number);
  return Number.isSafeInteger(low) && Number.isSafeInteger(high) && low <= high ? [low, high] : null;
}
const participation = [
  ["10–19", null, null], ["20–29", "10–19", "10–19"], ["20–29", null, "10–19"],
] as const;
export function schoolChartPreview(period: number) {
  const index = Number.isFinite(period) ? Math.min(2, Math.max(0, Math.trunc(period))) : 2;
  const p = participation[index];
  return {
    period: PREVIEW_MONTHS[index], cohort: "40–49", respondents: "40–49",
    participation: ["Check-ins", "Goal planning", "Clarity"].map((label, i) => ({ label, range: p[i] })),
    topics: [
      { label: "Tests & AP stress", range: index === 0 ? "10–19" : "20–29" },
      { label: "College & career", range: "10–19" },
      { label: "Friends & relationships", range: "10–19" },
      { label: "Social media pressure", range: index === 0 ? null : "10–19" },
      { label: "Sleep & rest", range: "10–19" },
      { label: "Identity & belonging", range: null },
      { label: "Jobs & family responsibilities", range: null },
      { label: "Grief & loss", range: null },
    ],
    belonging: [
      { label: "Feel welcomed", range: index === 0 ? "10–19" : "20–29" },
      { label: "Have a trusted adult", range: "20–29" },
      { label: "Feel connected", range: "10–19" },
    ],
    attendance: [
      { label: "School-provided baseline", range: "80–89" },
      { label: "Selected month", range: "80–89" },
    ],
    resets: [
      { label: "A fresh start", value: [4, 6, 8][index] },
      { label: "Before a test", value: [3, 4, 6][index] },
      { label: "Room for everyone", value: [2, 3, 4][index] },
    ],
    ambassadors: [
      { label: "Expressed interest", range: "20–29" },
      { label: "Attended orientation", range: "10–19" },
      { label: "Active ambassadors", range: "10–19" },
    ],
  };
}
