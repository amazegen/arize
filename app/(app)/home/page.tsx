import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Flame, CheckSquare, Users, Heart } from 'lucide-react'
import HomeGreeting from '@/components/home/HomeGreeting'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  const goalsThisWeek = { total: 0, complete: 0 }
  let villageCount = 0
  let avgMood = 0
  let recentCheckIn = null

  if (user) {
    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!p) {
      const metaName = (user.user_metadata?.full_name ?? user.user_metadata?.name) ?? null
      await supabase.from('profiles').upsert({ id: user.id, name: metaName }, { onConflict: 'id', ignoreDuplicates: true })
      const { data: created } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      profile = created
    } else {
      profile = p
    }

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const { data: goals } = await supabase
      .from('goals')
      .select('is_complete')
      .eq('user_id', user.id)
      .gte('week_of', weekStart.toISOString().split('T')[0])

    if (goals) {
      goalsThisWeek.total = goals.length
      goalsThisWeek.complete = goals.filter(g => g.is_complete).length
    }

    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    villageCount = count ?? 0

    const { data: recentCheckIns } = await supabase
      .from('check_ins')
      .select('mood_score, mood, energy, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (recentCheckIns && recentCheckIns.length > 0) {
      avgMood = Math.round((recentCheckIns.reduce((s, c) => s + c.mood_score, 0) / recentCheckIns.length) * 10) / 10
      recentCheckIn = recentCheckIns[0]
    }
  }

  const metadataName = user
    ? (user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim()
    : ''
  const displayName = profile?.name?.trim() || metadataName
  const firstName = displayName ? displayName.split(/\s+/)[0] : 'there'
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const isMorning = today.getHours() < 12
  const isAfternoon = today.getHours() >= 12 && today.getHours() < 17
  const greeting = isMorning ? 'Good morning' : isAfternoon ? 'Good afternoon' : 'Good evening'
  const isFriday = today.getDay() === 5
  const hasCheckedInToday = recentCheckIn
    ? new Date(recentCheckIn.created_at).toDateString() === today.toDateString()
    : false
  const moodLabel = avgMood <= 0
    ? null
    : avgMood < 1.8
      ? 'Tense'
      : avgMood < 2.8
        ? 'Low'
        : avgMood < 3.8
          ? 'Steady'
          : avgMood < 4.6
            ? 'Grounded'
            : 'Thriving'

  return (
    <div className="adult-home">
      <HomeGreeting initialFirstName={firstName} initialGreeting={greeting} initialDateLabel={dateStr} />
      <div className="adult-home-hero">
        <section className="adult-brand-card" aria-label="A moment for yourself" data-mascot-status="awaiting-approved-art">
          <div className="adult-sun-art" aria-hidden="true">
            <Image src="/design/arize/sun-ring-outer.svg" width={220} height={220} alt="" />
            <Image src="/design/arize/sun-ring-middle.svg" width={164} height={164} alt="" />
            <Image src="/design/arize/sun-ring-inner.svg" width={112} height={112} alt="" />
          </div>
          <strong>Ready when you are.</strong><p>One small step today.</p>
        </section>
        <section className="adult-checkin-card" aria-labelledby="home-checkin">
          <span className="adult-icon-chip"><Image src="/design/arize/sun.svg" width={24} height={24} alt="" /></span>
          <span className="adult-time-chip">{hasCheckedInToday ? 'Done ✓' : '1 min'}</span>
          <h2 id="home-checkin">{hasCheckedInToday ? 'You showed up.' : 'Check in'}</h2>
          <p>{hasCheckedInToday ? 'Make space for whatever comes next.' : 'Notice how you feel. One minute.'}</p>
          <Link className="adult-primary" href="/reset">{hasCheckedInToday ? 'View today’s reset' : 'Start check-in'} <ArrowRight size={18} /></Link>
        </section>
      </div>
      <div className="adult-shortcuts">
        <Link className="adult-shortcut" href="/coach"><span className="adult-icon-chip"><Image src="/design/arize/clarity-chip.svg" width={22} height={22} alt="" /></span><span><strong>Clarity</strong><small>AI coach</small></span></Link>
        <Link className="adult-shortcut" href="/goals"><span className="adult-icon-chip"><Image src="/design/arize/goals-chip.svg" width={22} height={22} alt="" /></span><span><strong>Goals</strong><small>Your next steps</small></span></Link>
      </div>
      <Link className="adult-village-shortcut" href="/village"><Users size={26} aria-hidden="true" /><span><strong>Find your people</strong><small>Real conversations in the Village.</small></span><ArrowRight size={20} /></Link>
      <section className="adult-stats" aria-label="Your recent activity">
        {[
          { icon: <Flame size={20} />, value: profile?.streak_count ?? 0, label: 'Day streak' },
          { icon: <CheckSquare size={20} />, value: goalsThisWeek.total > 0 ? goalsThisWeek.complete + '/' + goalsThisWeek.total : '—', label: 'Goals this week' },
          { icon: <Users size={20} />, value: villageCount, label: 'Village members' },
          { icon: <Heart size={20} />, value: avgMood > 0 ? avgMood + '/5' : '—', label: moodLabel ? 'Avg. mood · ' + moodLabel : 'Avg. mood score' },
        ].map(stat => <div key={stat.label} className="adult-stat">{stat.icon}<strong>{stat.value}</strong><span>{stat.label}</span></div>)}
      </section>
      <section className="adult-focus" aria-labelledby="today-focus"><h2 id="today-focus">Your next small step</h2>
        {isFriday ? <Link href="/goals/friday-reflection"><span>Friday Reflection — close out your week</span><ArrowRight size={18} /></Link> : null}
        <Link href="/goals"><span>{goalsThisWeek.total > 0 ? goalsThisWeek.complete + ' of ' + goalsThisWeek.total + ' goals complete this week' : 'Set your intentions for this week'}</span><ArrowRight size={18} /></Link>
        <Link href="/goals/patterns"><span>Notice your patterns over time</span><ArrowRight size={18} /></Link>
      </section>
    </div>
  )
}
