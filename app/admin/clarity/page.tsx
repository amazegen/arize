import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ClarityConsole from "@/components/clarity/ClarityConsole";
import { consoleSession } from "@/lib/clarity/server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await consoleSession("adult");
  if (!session.ok) {
    if (session.status === 404) notFound();
    if (session.status === 401) redirect("/sign-in");
    return <main style={{ padding: 32 }}><h1>Clarity configuration</h1><p role="alert">{session.error}</p><Link href="/settings">Back to profile</Link></main>;
  }
  const result = await session.supabase.rpc("clarity_console_state", { p_edition: "adult" });
  if (result.error || !result.data) return <main><h1>Console unavailable</h1><p role="alert">Reload or check your administrator access.</p></main>;
  return <ClarityConsole edition="adult" initial={result.data} />;
}
