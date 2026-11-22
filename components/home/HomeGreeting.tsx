'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function getGreeting(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getDateLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

interface HomeGreetingProps {
  initialFirstName: string
  initialGreeting: string
  initialDateLabel: string
}

export default function HomeGreeting({
  initialFirstName,
  initialGreeting,
  initialDateLabel,
}: HomeGreetingProps) {
  const [firstName, setFirstName] = useState(initialFirstName)
  const [greeting, setGreeting] = useState(initialGreeting)
  const [dateLabel, setDateLabel] = useState(initialDateLabel)

  useEffect(() => {
    const updateLocalTime = () => {
      const now = new Date()
      setGreeting(getGreeting(now))
      setDateLabel(getDateLabel(now))
    }

    updateLocalTime()
    const timer = window.setInterval(updateLocalTime, 60_000)

    async function loadLatestName() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()

      const savedName = profile?.name?.trim()
      const metadataName = (
        user.user_metadata?.full_name
        ?? user.user_metadata?.name
        ?? ''
      ).trim()
      const displayName = savedName || metadataName
      if (displayName) setFirstName(displayName.split(/\s+/)[0])
    }

    loadLatestName()
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="adult-home-greeting">
      <h1>{greeting}, {firstName}.</h1>
      <p>Private support for you, built by people like you.</p>
      <p className="adult-greeting-date">{dateLabel}</p>
    </div>
  )
}
