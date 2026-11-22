import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { VillageRoom } from '@/lib/types'
import { getUserAccess } from '@/lib/access/server'
import { canAccessVillageRoom } from '@/lib/access/entitlements'
import { LockKeyhole } from 'lucide-react'
import { redirect } from 'next/navigation'

const ROOM_ICONS: Record<string, string> = {
  'First Gen in Finance': '💼',
  'Manager Mode': '🎯',
  'Navigating the Room': '🧭',
  'Wins Only': '✦',
}

export default async function VillagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')
  const access = await getUserAccess(supabase, user.id)

  const { data: rooms } = await supabase
    .from('village_rooms')
    .select('*')
    .order('is_featured', { ascending: false })

  const { count: userCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const rooms_ = (rooms ?? []) as VillageRoom[]

  return (
    <div style={{ background: "var(--cream)", minHeight: '100%', paddingBottom: '16px' }}>

      <div style={{ padding: "20px 20px 0" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '8px' }}>
          The Village
        </p>
        <h1 style={{ marginBottom: '4px' }}>Village</h1>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.4 }}>
          Private rooms for real conversations. Built by people like you.
        </p>
      </div>

      {/* Member count */}
      <div style={{ margin: "16px 20px 0", padding: '12px 16px', background: "var(--green-soft)", border: "1px solid var(--border)", borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>👥</span>
        <p style={{ fontSize: "14px", color: "var(--green)" }}>
          <span style={{ fontWeight: 600, color: "var(--green)" }}>{userCount ?? 0}</span> members and growing — invite your people
        </p>
      </div>

      <div style={{ margin: "20px 20px 0" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: "var(--green)", marginBottom: '12px' }}>
          Active Rooms
        </p>
      </div>

      <div style={{ padding: "0 20px", display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rooms_.map(room => {
          const canEnter = canAccessVillageRoom(access, room.name)
          return (
          <div key={room.id} style={{
            background: room.is_featured
              ? "var(--green-soft)"
              : "var(--surface)",
            border: `1px solid ${room.is_featured ? 'var(--border)' : 'var(--border)'}`,
            borderRadius: '20px', padding: '18px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: room.is_featured ? "var(--green-soft)" : "var(--surface-soft)",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0,
                }}>
                  {ROOM_ICONS[room.name] ?? '💬'}
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-adult)", fontSize: '16px', color: "var(--ink)", fontWeight: 400, marginBottom: '4px', lineHeight: 1.3 }}>
                    {room.name}
                  </p>
                  <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.4, maxWidth: '220px' }}>
                    {room.description}
                  </p>
                </div>
              </div>
              {!canEnter ? (
                <span style={{ background: "var(--yellow-soft)", border: "1px solid var(--yellow)", color: "var(--green)", fontSize: "13px", fontWeight: 600, letterSpacing: '0.08em', padding: '4px 8px', borderRadius: '100px', textTransform: 'uppercase', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <LockKeyhole size={10} /> Plus
                </span>
              ) : room.is_featured && (
                <span style={{
                  background: "var(--error-soft)", border: "1px solid var(--border)",
                  color: "var(--error)", fontSize: "13px", fontWeight: 600, letterSpacing: '0.1em',
                  padding: '4px 8px', borderRadius: '100px', textTransform: 'uppercase', flexShrink: 0,
                }}>Live</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: "1px solid var(--border)" }}>
              <p style={{ fontSize: "14px", color: "var(--muted)" }}>{access.limits.villageMedia ? 'Text · Voice · Video' : 'Text community'}</p>
              <Link href={canEnter ? `/village/${room.id}` : '/upgrade'} className="adult-secondary">
                {canEnter ? 'Enter →' : 'Unlock →'}
              </Link>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
