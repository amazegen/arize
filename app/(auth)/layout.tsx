export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="adult-theme adult-auth">{children}</div>
}
