import { redirect } from "next/navigation";
import StudentStaffEntry from "@/components/student/StudentStaffEntry";
import { getOperationsSession } from "@/lib/student/operations-server";
import { staffDestination } from "@/lib/student/operations";
export const dynamic = "force-dynamic";
export default async function StaffEntryPage() {
  const session = await getOperationsSession();
  if (session.ok && (session.state.role || session.state.operator)) redirect(staffDestination(session.state));
  return <StudentStaffEntry initial={session.ok ? session.state : null} signupReady={process.env.STUDENT_STAFF_SIGNUP_ENABLED==="true"} error={!session.ok && session.status !== 401 ? session.error : undefined} />;
}
