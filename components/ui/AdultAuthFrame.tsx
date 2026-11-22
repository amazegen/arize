import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function AdultAuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="adult-auth-page">
    <header><Link className="adult-brand" href="/" aria-label="Arize home"><Image src="/flower%20nobg.png" width={36} height={36} style={{ width: 36, height: 36 }} alt="" /><span>Arize</span></Link></header>
    <main className="adult-auth-card">
      <Link className="adult-auth-back" href="/"><span><ArrowLeft size={18} /></span>Back</Link>
      <div className="adult-page-heading"><h1>{title}</h1><p>{subtitle}</p></div>
      {children}
    </main>
  </div>
}
