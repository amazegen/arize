import Image from 'next/image'
import Link from 'next/link'
import { BarChart3, Home, ShieldCheck, Sparkles, Users, Info, CreditCard } from 'lucide-react'
import { chartPoints, conversionRate, type FounderDays, type FounderMetrics } from '@/lib/founder/metrics'
import { FounderControls, FounderSignOut } from './FounderControls'
import styles from './founder.module.css'

const number = (n: number) => n.toLocaleString('en-US')
const dateLabel = (day: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(`${day}T12:00:00Z`))
const timeLabel = (time: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(time))

function ActivityChart({ data }: { data: FounderMetrics }) {
  const points = chartPoints(data.trend), max = Math.max(1, ...points.map(p => p.weeklyActiveUsers))
  const width = 560, height = 220, plot = 156, slot = (width - 44) / points.length
  return <section className={styles.panel} aria-labelledby="founder-activity-title">
    <h2 id="founder-activity-title">Weekly active users</h2>
    <p>Distinct people with recorded activity in the preceding seven calendar days.</p>
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="founder-chart-title founder-chart-desc">
        <title id="founder-chart-title">Rolling seven-day active adult users</title>
        <desc id="founder-chart-desc">Zero-based count scale, maximum {max}. {points.map(p => `${p.day}: ${p.weeklyActiveUsers}`).join('; ')}. Exact daily figures are available below.</desc>
        <line x1="32" y1="182" x2="554" y2="182" stroke="var(--border)" />
        <text x="4" y="26" className={styles.axis}>{number(max)}</text><text x="12" y="185" className={styles.axis}>0</text>
        {points.map((p, i) => {
          const barHeight = p.weeklyActiveUsers / max * plot, x = 38 + i * slot
          return <g key={p.day}><rect x={x} y={182 - barHeight} width={Math.max(2, slot - 10)} height={barHeight} rx="5" fill={i === points.length - 1 ? 'var(--green)' : 'var(--green-soft)'}><title>{dateLabel(p.day)}: {number(p.weeklyActiveUsers)} active users</title></rect>
            {(points.length <= 8 || i % 2 === 0 || i === points.length - 1) && <text x={x + (slot - 10) / 2} y="207" textAnchor="middle" className={styles.axis}>{dateLabel(p.day)}</text>}
          </g>
        })}
      </svg>
      <figcaption>{data.weeklyActiveUsers === 0 && data.activeUsers === 0 ? 'No recorded activity in this range.' : 'Each bar is a rolling snapshot; overlapping counts are not added together.'}</figcaption>
    </figure>
  </section>
}

function FeatureUse({ data }: { data: FounderMetrics }) {
  const rows = [['Check-ins', data.featureUsers.checkIns], ['Clarity', data.featureUsers.clarity], ['New goals', data.featureUsers.goals], ['Village posts', data.featureUsers.village]] as const
  const max = Math.max(1, ...rows.map(r => r[1]))
  return <section className={styles.panel} aria-labelledby="founder-feature-title"><h2 id="founder-feature-title">People by feature</h2><p>Distinct people in the selected {data.days}-day range.</p>
    <dl className={styles.features}>{rows.map(([label, count]) => <div key={label}><dt>{label}</dt><dd><span className={styles.track} aria-hidden="true"><span style={{ width: `${count / max * 100}%` }} /></span><strong>{number(count)}</strong></dd></div>)}</dl>
    <p className={styles.caption}>A person can use more than one feature. Counts do not add up to unique users.</p>
  </section>
}

function Membership({ data }: { data: FounderMetrics }) {
  const c = data.conversion, rate = conversionRate(c), incomplete = c.missingCaptures + c.pendingWebhooks > 0
  return <section id="membership" className={styles.panel} aria-labelledby="founder-billing-title"><div className={styles.panelHeading}><h2 id="founder-billing-title">Memberships</h2><span className={styles.mode}>{data.billingMode === 'test' ? 'Sandbox counts' : 'Live-mode records'}</span></div>
    <p>Current saved subscription state, independent of the selected activity range. This is not a revenue report.</p>
    <dl className={styles.memberships}>{[['Plus monthly', data.billing.monthly], ['Plus annual', data.billing.annual], ['Stripe trials', data.billing.stripeTrials], ['Complimentary trials', data.billing.complimentaryTrials]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{number(Number(value))}</dd></div>)}</dl>
    {data.billing.unclassified > 0 && <p role="status">Incomplete classification: {number(data.billing.unclassified)} active billing records lack a recognized period, mode or Stripe status. The classified counts above may be incomplete; these records have not been guessed into a tier.</p>}
    <div className={styles.conversion}><div><h3>Trial-to-paid conversion</h3><strong>{rate === null ? '—' : `${rate}%`}</strong></div><div>
      <p>{incomplete ? 'Unavailable: billing events are pending or reporting captures are incomplete.' : c.eligibleTrials === 0 ? 'Awaiting mature trial cohorts. No conversion rate is available yet.' : `${number(c.convertedTrials!)} of ${number(c.eligibleTrials!)} eligible trials had a positive paid invoice within seven days of the trial ending.`}</p>
      <p className={styles.caption}>Trials ending in this range, with a full seven-day follow-up. Only cohorts starting after capture began are eligible. Complimentary trials are excluded.</p>
    </div></div>
    <p className={styles.caption}>Capture started {timeLabel(c.captureStartedAt)}. {c.lastWebhookAt ? `Last processed webhook: ${timeLabel(c.lastWebhookAt)}.` : 'No webhook processed since capture began.'} Refunds and disputes do not reverse this conversion measure.</p>
  </section>
}

function Definitions() {
  return <details id="definitions" className={styles.panel}><summary><Info size={18} aria-hidden="true" />How these numbers are counted</summary><dl className={styles.definitions}>
    <div><dt>Registrations</dt><dd>Retained adult Auth accounts with an app profile, created in the selected range, including unconfirmed accounts. Founder/Clarity administrator accounts and accounts awaiting deletion are excluded throughout this overview. Deleted accounts and their activity are not retained as historical totals.</dd></div>
    <div><dt>Active users</dt><dd>A person with a saved check-in, new goal, Village post or saved Clarity user turn. A visit or login alone does not count. Weekly active always covers the most recent seven calendar days; the other activity totals use the selected range.</dd></div>
    <div><dt>Clarity sessions</dt><dd>Distinct saved conversations with at least one user turn in the range—not empty conversations, quota requests, administrator previews or model calls. This measures recorded use, not therapeutic outcomes or guaranteed AI replies.</dd></div>
    <div><dt>Subscriptions and trials</dt><dd>Verified Stripe-linked access records in the configured billing mode. Active monthly/annual subscriptions exclude trialing and payment-grace states; cancellation scheduled for period end still counts until that period ends. Complimentary trials are shown separately; admin grants and temporary outage access are not paid subscriptions.</dd></div>
    <div><dt>Conversion</dt><dd>Subscription-trial cohorts, not unique people. A positive USD invoice marked paid is the qualifying observation, not a checkout redirect, active status alone or a $0 trial invoice. Older history is not reconstructed. A missing reporting capture or pending webhook withholds the rate rather than showing a misleading zero.</dd></div>
    <div><dt>Dates and freshness</dt><dd>America/New_York calendar dates, including daylight-saving changes. Today is partial. Records are read when this view refreshes; Stripe counts reflect the latest saved webhook state, not a live provider reconciliation.</dd></div>
  </dl></details>
}

export default function FounderDashboard({ metrics: data, days, invalidRange = false, canConfigureClarity = false }: { metrics: FounderMetrics | null; days: FounderDays; invalidRange?: boolean; canConfigureClarity?: boolean }) {
  return <div className={`adult-theme ${styles.shell}`}>
    <a className="adult-skip-link" href="#founder-main">Skip to overview</a>
    <aside className={styles.sidebar}><Link className={styles.brand} href="/home" aria-label="Arize home"><Image src="/design/founder/logo.png" width={36} height={33} alt="" style={{ width: 36, height: 33 }} /><span>Arize<small>ADMIN</small></span></Link>
      <nav aria-label="Founder navigation"><Link href="/admin/founder" aria-current="page"><BarChart3 size={20} aria-hidden="true" />Overview</Link>
        {canConfigureClarity && <Link href="/admin/clarity"><Sparkles size={20} aria-hidden="true" />Clarity console</Link>}
        <a href="#membership"><CreditCard size={20} aria-hidden="true" />Memberships</a><a href="#definitions"><Info size={20} aria-hidden="true" />Metric definitions</a><Link href="/settings"><Users size={20} aria-hidden="true" />Your account</Link><Link href="/home"><Home size={20} aria-hidden="true" />Back to app</Link>
      </nav><div className={styles.sidebarFooter}><FounderSignOut /></div>
    </aside>
    <main id="founder-main" className={styles.main} tabIndex={-1}>
      <Link className={styles.profile} href="/settings" aria-label="Open your profile"><Image src="/design/founder/profile.svg" width={44} height={44} alt="" /></Link>
      <header className={styles.header}><div><h1>Overview</h1><p>How Arize is doing. Aggregate data only.</p></div><FounderControls days={days} /></header>
      {data ? <>
        <div className={styles.scope}><span className={styles.mode}>{data.billingMode === 'test' ? 'Stripe sandbox · no live billing figures' : 'Live-mode billing records'}</span><span>{dateLabel(data.fromDay)} – {dateLabel(data.throughDay)} · Today is partial</span></div>
        <div className={styles.cards}>{[
          { label: 'Registrations', value: data.registrations, note: `${number(data.registeredAccounts)} retained accounts` },
          { label: 'Weekly active', value: data.weeklyActiveUsers, note: 'Most recent 7 calendar days' },
          { label: 'Check-ins', value: data.checkIns, note: `Last ${days} days` },
          { label: 'Plus subscriptions', value: data.billing.monthly + data.billing.annual, note: 'Monthly + annual · current state' },
        ].map(c => <section key={c.label} className={styles.card} aria-label={c.label}><h2>{c.label}</h2><strong>{number(c.value)}</strong><p>{c.note}</p></section>)}</div>
        <p className={styles.activitySummary}>{number(data.activeUsers)} active people · {number(data.claritySessions)} Clarity conversations in the selected {days}-day range</p>
        <div className={styles.charts}><ActivityChart data={data} /><FeatureUse data={data} /></div>
        <Membership data={data} />
        <section className={styles.privacy}><ShieldCheck size={22} aria-hidden="true" /><p>Aggregate counts only. No names, chat messages, journal text or individual check-in scores are included.</p></section>
        <section className={styles.panel}><div className={styles.panelHeading}><h2>Student Edition</h2><span className={styles.neutral}>Not connected</span></div><p>The Student workspace remains separate. No Student credentials, school lists or private records are loaded here. Its approved aggregate-only reporting connection has not been activated.</p></section>
        <details className={styles.panel}><summary>Exact daily counts</summary><p>Clarity conversations are distinct per day; a conversation used on several days appears in several rows. Daily counts are not a lifetime ledger.</p><div className={styles.tableWrap}><table><caption>Adult activity by New York calendar date</caption><thead><tr><th scope="col">Date</th><th scope="col">Registrations</th><th scope="col">Weekly active</th><th scope="col">Check-ins</th><th scope="col">Clarity sessions</th></tr></thead><tbody>{data.trend.map(p => <tr key={p.day}><th scope="row">{p.day}</th><td>{number(p.registrations)}</td><td>{number(p.weeklyActiveUsers)}</td><td>{number(p.checkIns)}</td><td>{number(p.claritySessions)}</td></tr>)}</tbody></table></div></details>
        <p className={styles.caption}>Updated {timeLabel(data.asOf)}. Use Refresh to load a new snapshot.</p>
      </> : <section className={styles.panel} role="alert"><h2>{invalidRange ? 'Choose a supported range' : 'Reporting is unavailable'}</h2><p>{invalidRange ? 'Select 7, 30 or 90 days above.' : 'The reporting migration may not be installed, or the backend is temporarily unavailable. No numbers have been substituted.'}</p></section>}
      <Definitions />
    </main>
  </div>
}
