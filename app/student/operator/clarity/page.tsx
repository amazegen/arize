import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ClarityConsole from "@/components/clarity/ClarityConsole";
import { consoleSession } from "@/lib/clarity/server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await consoleSession("student");
  if (!session.ok) {
    if (session.status === 404) notFound();
    if (session.status === 401) redirect("/student/sign-in");
    return <main className="student-main"><h1>Clarity configuration</h1><p role="alert">{session.error}</p><Link href="/student/operator">Back to project workspace</Link></main>;
  }
  const result = await session.supabase.rpc("clarity_console_state", { p_edition: "student" });
  if (result.error || !result.data) return <main className="student-main"><h1>Console unavailable</h1><p role="alert">Reload or check your administrator access.</p></main>;
  return <ClarityConsole edition="student" initial={result.data} />;
}
