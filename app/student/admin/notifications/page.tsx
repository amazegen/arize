import Link from "next/link";
import { redirect } from "next/navigation";
import StudentBrand from "@/components/student/StudentBrand";
import StudentNotificationSettings from "@/components/student/StudentNotificationSettings";
import {
  getNotificationAdminSession,
  loadNotificationSettings,
} from "@/lib/student/admin-server";

export const dynamic = "force-dynamic";

export default async function CounselorNotificationAdminPage() {
  const session = await getNotificationAdminSession();
  const signIn = "/student/sign-in?next=%2Fstudent%2Fadmin%2Fnotifications";
  if (!session.ok && session.status === 401) redirect(signIn);
  if (!session.ok)
    return (
      <div className="student-admin-settings">
        <header className="student-header">
          <Link className="student-brand" href="/student/admin/notifications">
            <StudentBrand />
          </Link>
        </header>
        <main className="student-main">
          <h1>Staff access required</h1>
          <p className="student-error" role="alert">
            {session.error}
          </p>
          <Link className="student-action" href={signIn}>
            Sign in with an approved staff account
          </Link>
        </main>
      </div>
    );
  const settings = await loadNotificationSettings(session);
  if (!settings)
    return (
      <div className="student-admin-settings">
        <main className="student-main">
          <h1>Counselor Notifications</h1>
          <p className="student-error" role="alert">
            Notification settings are unavailable. No change has been made.
          </p>
        </main>
      </div>
    );
  return (
    <StudentNotificationSettings
      initial={settings}
      schoolName={session.schoolName}
    />
  );
}
