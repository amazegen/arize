import { redirect } from "next/navigation";
import StudentOperatorWorkspace from "@/components/student/StudentOperatorWorkspace";
import { getOperationsSession } from "@/lib/student/operations-server";
import { operatorOverviewDTO } from "@/lib/student/operations";
import { operatorView } from "@/lib/student/operator";
import { STUDENT_COACH_PROMPT_VERSION } from "@/lib/student/coach";
export const dynamic = "force-dynamic";
export default async function OperatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getOperationsSession();
  if (!session.ok || !session.state.operator) redirect("/student/staff");
  const overview = await session.supabase.rpc("student_operator_overview");
  if (overview.error) return <main className="student-main"><h1>Operations unavailable</h1><p role="alert">No business data could be loaded. Reload or check your operator access.</p></main>;
  const params = await searchParams;
  const enrollment = await session.supabase.rpc("student_find_enrollment", { p_email: "availability-check@invalid.example" });
  return <StudentOperatorWorkspace initial={operatorOverviewDTO(overview.data)} initialView={operatorView(params.view)} email={session.user.email ?? "Project administrator"} config={{ aiEnabled: process.env.STUDENT_AI_ENABLED === "true", aiConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.STUDENT_COACH_MODEL), model: process.env.STUDENT_COACH_MODEL ?? null, promptVersion: STUDENT_COACH_PROMPT_VERSION, staffSignupEnabled: process.env.STUDENT_STAFF_SIGNUP_ENABLED === "true", counselorSendingEnabled: process.env.STUDENT_COUNSELOR_NOTIFICATIONS_ENABLED === "true", enrollmentManagementReady: !enrollment.error }} />;
}
