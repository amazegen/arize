'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Heart } from 'lucide-react'

export const navItems = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/reset', label: 'Reflect', icon: null },
  { href: '/goals', label: 'Goals', icon: 'goals' },
  { href: '/coach', label: 'Clarity', icon: 'clarity' },
  { href: '/village', label: 'Village', icon: 'village' },
  { href: '/settings', label: 'Profile', icon: 'profile' },
] as const

export function BottomNav() {
  const pathname = usePathname()
  return <nav className="adult-nav" aria-label="Main navigation">
    <div className="adult-nav-brand"><Link className="adult-brand" href="/home" aria-label="Arize home"><Image src="/flower%20nobg.png" width={36} height={36} style={{ width: 36, height: 36 }} alt="" /><span>Arize</span></Link></div>
    <div className="adult-nav-links">{navItems.map(({ href, label, icon }) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined}>
      <span className="adult-nav-icon">{icon ? <Image src={`/design/arize/${icon}.svg`} width={22} height={22} alt="" /> : <Heart size={22} aria-hidden="true" />}</span><span>{label}</span>
    </Link>)}</div>
    <p className="adult-nav-footer">by AmazeGen<br />Private support. Your pace.</p>
  </nav>
}
