import { redirect } from "next/navigation";
import StudentTeacherWorkspace from "@/components/student/StudentTeacherWorkspace";
import { getOperationsSession } from "@/lib/student/operations-server";
export const dynamic = "force-dynamic";
export default async function TeacherPage() {
  const session = await getOperationsSession();
  if (!session.ok || session.state.role !== "teacher") redirect("/student/staff");
  return <StudentTeacherWorkspace initial={session.state} />;
}
