import { redirect } from "next/navigation";
import StudentStaffEntry from "@/components/student/StudentStaffEntry";
import { getOperationsSession } from "@/lib/student/operations-server";
import { staffDestination } from "@/lib/student/operations";
import { verifiedAccountDestination } from "@/lib/student/account-server";
export const dynamic = "force-dynamic";
export default async function StaffEntryPage() {
  const session = await getOperationsSession();
  if (session.ok) {
    const destination = await verifiedAccountDestination(session.supabase, session.user.id);
    if (!destination) return <StudentStaffEntry initial={null} signupReady={false} error="Your assigned workspace could not be verified. Please refresh before continuing." />;
    if (destination === "/student") redirect(destination);
  }
  if (session.ok && (session.state.role || session.state.operator)) redirect(staffDestination(session.state));
  return <StudentStaffEntry initial={session.ok ? session.state : null} signupReady={process.env.STUDENT_STAFF_SIGNUP_ENABLED==="true"} error={!session.ok && session.status !== 401 ? session.error : undefined} />;
}
