import { redirect } from "next/navigation";
import Link from "next/link";
import StudentStaffDashboard from "@/components/student/StudentStaffDashboard";
import { getStaffSession, loadStaffDashboard } from "@/lib/student/staff-server";
export const dynamic = "force-dynamic";
export default async function StaffDashboardPage() {
  const session = await getStaffSession();
  if (!session.ok && session.status === 401) redirect("/student/sign-in?next=%2Fstudent%2Fadmin");
  if (!session.ok) return <main className="student-main"><h1>Staff access required</h1><p role="alert" className="student-error">{session.error}</p><Link href="/student/sign-in?next=%2Fstudent%2Fadmin" className="student-action">Sign in with your approved staff account</Link></main>;
  const data = await loadStaffDashboard(session);
  if (!data) return <main className="student-main"><h1>Your workspace is unavailable</h1><p role="alert">No private data has been shown. Please reload or contact the pilot operator.</p></main>;
  return <StudentStaffDashboard initial={data} />;
}
