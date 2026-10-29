export const REPORT_TOPICS = ["tests","future","social","relationships","identity","sleep","responsibilities","grief"] as const;
export const REPORT_LESSONS = ["fresh-start","before-a-test","connection"] as const;
export type ReportInsights = {
  version?: number;
  topics?: Record<string, string | null> | null;
  belonging?: Record<string, { positive: string | null; respondents: string | null }> | null;
  attendance?: { rate: string | null } | null;
  resets?: Record<string, number | null> | null;
  ambassadors?: { interested: string | null; oriented: string | null; active: string | null } | null;
};
export function safeBand(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,6}–\d{1,6}$/.test(value)) return null;
  const [low, high] = value.split("–").map(Number);
  return low <= high ? value : null;
}
// Explicit whitelist: never serialize an arbitrary report JSON into the browser.
export function reportInsights(value: ReportInsights): ReportInsights {
  if (value.version !== 2) return {};
  return {
    version: 2,
    topics: value.topics ? Object.fromEntries(REPORT_TOPICS.map((k) => [k, safeBand(value.topics?.[k])])) : null,
    belonging: value.belonging ? Object.fromEntries(["welcome","trusted_adult","connection"].map((k) => [k, { positive: safeBand(value.belonging?.[k]?.positive), respondents: safeBand(value.belonging?.[k]?.respondents) }])) : null,
    attendance: value.attendance ? { rate: safeBand(value.attendance.rate) } : null,
    resets: value.resets ? Object.fromEntries(REPORT_LESSONS.map((k) => { const n = value.resets?.[k]; return [k, Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : null]; })) : null,
    ambassadors: value.ambassadors ? { interested: safeBand(value.ambassadors.interested), oriented: safeBand(value.ambassadors.oriented), active: safeBand(value.ambassadors.active) } : null,
  };
}
