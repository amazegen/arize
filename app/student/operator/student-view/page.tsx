import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import StudentWorkspace from "@/components/student/StudentWorkspace";
import { getOperationsSession } from "@/lib/student/operations-server";
import { STUDENT_NOTICE_VERSION } from "@/lib/student/policy";
import { studentPreviewScreen } from "@/lib/student/student-preview";

export const dynamic = "force-dynamic";

export default async function AdminStudentView({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getOperationsSession();
  if (!session.ok) {
    if (session.status === 401) redirect("/student/sign-in?next=%2Fstudent%2Foperator");
    return <main className="student-main student-narrow"><h1>Student preview unavailable</h1><p role="alert">{session.error}</p><Link href="/student/staff">Return to your workspace</Link></main>;
  }
  if (!session.state.operator) redirect("/student/staff");
  const params = await searchParams;
  return <>
    <aside className="student-admin-preview" aria-label="Administrator student preview">
      <div><strong>Viewing the student experience</strong><p>Example student data only. Changes are temporary; no counselor emails are sent. Your administrator role stays unchanged.</p></div>
      <nav aria-label="Student preview tools">
        <Link className="student-secondary" href="/student/operator"><ArrowLeft size={18} />Back to admin dashboard</Link>
        <Link className="student-secondary" href="/student/operator?view=clarity"><MessageCircle size={18} />Live Clarity test lab</Link>
      </nav>
    </aside>
    <StudentWorkspace preview adminPreview initialScreen={studentPreviewScreen(params.screen)}
      initialHistory={params.history === "true"}
      initialProfile={{ display_name: "Example student", grade: "10", notice_version: STUDENT_NOTICE_VERSION }}
      school={{ name: "Example school", time_zone: "America/New_York", counselor_url: null, counselor_instructions: "This is an administrator preview. No contact request is sent." }} />
  </>;
}
