export const FOUNDER_RANGES = [7, 30, 90] as const
export type FounderDays = typeof FOUNDER_RANGES[number]
export function founderDays(value: unknown): FounderDays | null {
  if (value === undefined || value === null) return 30
  if (value === '7' || value === '30' || value === '90') return Number(value) as FounderDays
  return null
}
export type TrendPoint = { day: string; registrations: number; checkIns: number; claritySessions: number; weeklyActiveUsers: number }
export type FounderMetrics = {
  schemaVersion: 1; asOf: string; timeZone: 'America/New_York'; days: FounderDays; fromDay: string; throughDay: string; billingMode: 'test' | 'live'
  registrations: number; registeredAccounts: number; weeklyActiveUsers: number; activeUsers: number; checkIns: number; claritySessions: number
  featureUsers: { checkIns: number; clarity: number; goals: number; village: number }
  billing: { monthly: number; annual: number; stripeTrials: number; complimentaryTrials: number; unclassified: number }
  conversion: { captureStartedAt: string; eligibleTrials: number | null; convertedTrials: number | null; missingCaptures: number; pendingWebhooks: number; lastWebhookAt: string | null }
  trend: TrendPoint[]
}

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid reporting response')
  return v as Record<string, unknown>
}
function count(v: unknown) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error('Invalid reporting count')
  return v
}
function timestamp(v: unknown) {
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v)) || !/T/.test(v)) throw new Error('Invalid reporting timestamp')
  return new Date(v).toISOString()
}
function day(v: unknown) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error('Invalid reporting day')
  return v
}

// Whitelist the aggregate response before crossing the server/browser boundary.
// Extra upstream keys, nested records, emails and payment IDs are never copied.
export function founderMetrics(value: unknown, expectedDays: FounderDays, expectedMode: 'test' | 'live'): FounderMetrics {
  const v = object(value), f = object(v.featureUsers), b = object(v.billing), c = object(v.conversion)
  if (v.schemaVersion !== 1 || v.days !== expectedDays || v.timeZone !== 'America/New_York' || v.billingMode !== expectedMode) throw new Error('Unexpected reporting scope')
  if (!Array.isArray(v.trend) || v.trend.length !== expectedDays) throw new Error('Incomplete reporting series')
  const from = day(v.fromDay), through = day(v.throughDay)
  const trend = v.trend.map((row, i) => {
    const r = object(row), date = day(r.day)
    if (date !== new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10)) throw new Error('Non-contiguous reporting series')
    return { day: date, registrations: count(r.registrations), checkIns: count(r.checkIns), claritySessions: count(r.claritySessions), weeklyActiveUsers: count(r.weeklyActiveUsers) }
  })
  if (trend.at(-1)?.day !== through) throw new Error('Reporting range mismatch')
  const eligibleTrials = c.eligibleTrials === null ? null : count(c.eligibleTrials)
  const convertedTrials = c.convertedTrials === null ? null : count(c.convertedTrials)
  const missingCaptures = count(c.missingCaptures), pendingWebhooks = count(c.pendingWebhooks)
  if ((eligibleTrials === null) !== (convertedTrials === null) || (convertedTrials !== null && convertedTrials > eligibleTrials!)
    || ((missingCaptures + pendingWebhooks > 0) && eligibleTrials !== null)) throw new Error('Inconsistent reporting coverage')
  const result: FounderMetrics = {
    schemaVersion: 1, asOf: timestamp(v.asOf), timeZone: 'America/New_York', days: expectedDays, fromDay: from, throughDay: through, billingMode: expectedMode,
    registrations: count(v.registrations), registeredAccounts: count(v.registeredAccounts), weeklyActiveUsers: count(v.weeklyActiveUsers), activeUsers: count(v.activeUsers), checkIns: count(v.checkIns), claritySessions: count(v.claritySessions),
    featureUsers: { checkIns: count(f.checkIns), clarity: count(f.clarity), goals: count(f.goals), village: count(f.village) },
    billing: { monthly: count(b.monthly), annual: count(b.annual), stripeTrials: count(b.stripeTrials), complimentaryTrials: count(b.complimentaryTrials), unclassified: count(b.unclassified) },
    conversion: { captureStartedAt: timestamp(c.captureStartedAt), eligibleTrials, convertedTrials, missingCaptures, pendingWebhooks, lastWebhookAt: c.lastWebhookAt === null ? null : timestamp(c.lastWebhookAt) }, trend,
  }
  if (result.registrations !== trend.reduce((n, p) => n + p.registrations, 0)
    || result.checkIns !== trend.reduce((n, p) => n + p.checkIns, 0)
    || result.weeklyActiveUsers !== trend.at(-1)!.weeklyActiveUsers
    || result.activeUsers > result.registeredAccounts || result.weeklyActiveUsers > result.activeUsers
    || Object.values(result.featureUsers).some(n => n > result.activeUsers)
    || result.claritySessions > trend.reduce((n, p) => n + p.claritySessions, 0)) throw new Error('Reporting totals do not reconcile')
  return result
}

export function conversionRate(c: FounderMetrics['conversion']) {
  if (c.eligibleTrials === null || c.convertedTrials === null || c.eligibleTrials === 0) return null
  return Math.round(c.convertedTrials / c.eligibleTrials * 1000) / 10
}
export function chartPoints(trend: TrendPoint[]) {
  const step = Math.max(1, Math.ceil(trend.length / 14))
  return trend.filter((_, i) => i % step === 0 || i === trend.length - 1)
}
