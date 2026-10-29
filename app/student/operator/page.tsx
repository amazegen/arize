import { redirect } from "next/navigation";
import StudentOperatorWorkspace from "@/components/student/StudentOperatorWorkspace";
import { getOperationsSession } from "@/lib/student/operations-server";
import { operatorOverviewDTO } from "@/lib/student/operations";
export const dynamic = "force-dynamic";
export default async function OperatorPage() {
  const session = await getOperationsSession();
  if (!session.ok || !session.state.operator) redirect("/student/staff");
  const overview = await session.supabase.rpc("student_operator_overview");
  if (overview.error) return <main className="student-main"><h1>Operations unavailable</h1><p role="alert">No business data could be loaded. Reload or check your operator access.</p></main>;
  return <StudentOperatorWorkspace initial={operatorOverviewDTO(overview.data)} />;
}
