import Image from 'next/image'
import Link from 'next/link'

export function AppHeader({ initial = 'A' }: { initial?: string }) {
  return (
    <header className="adult-header">
      <Link href="/home" className="adult-brand" aria-label="Go to Arize home">
        <Image
          src="/flower%20nobg.png"
          alt=""
          width={38}
          height={38}
          style={{ width: 38, height: 38 }}
          priority
        />
        <span>Arize</span>
      </Link>
      <Link className="adult-avatar" href="/settings" aria-label="Open your profile">{initial}</Link>
    </header>
  )
}
