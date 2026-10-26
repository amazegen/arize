import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/student/server";
import { STUDENT_NOTICE_VERSION } from "@/lib/student/policy";
import StudentWorkspace from "@/components/student/StudentWorkspace";
import { StudentAccessMessage } from "@/components/student/StudentShell";
import type { StudentScreen } from "@/components/student/StudentShell";

export const dynamic = "force-dynamic";

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getStudentSession();
  if (!session.ok) {
    if (session.status === 401) redirect("/student/sign-in");
    return <StudentAccessMessage message={session.error} />;
  }
  const { data: profile, error } = await session.supabase
    .from("student_profiles")
    .select("display_name, grade, notice_version")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error)
    return (
      <StudentAccessMessage message="Student onboarding is temporarily unavailable. Please try again later." />
    );
  const { data: school } = await session.supabase
    .from("student_schools")
    .select("name, counselor_url, counselor_instructions")
    .eq("id", session.membership.school_id)
    .single();
  if (!school)
    return (
      <StudentAccessMessage message="Your school's pilot setup is not ready. Please contact your pilot coordinator." />
    );
  const params = await searchParams;
  const screens: StudentScreen[] = [
    "home",
    "check-in",
    "goals",
    "clarity",
    "counselor",
    "profile",
  ];
  const screen = screens.includes(params.screen as StudentScreen)
    ? (params.screen as StudentScreen)
    : "home";
  return (
    <StudentWorkspace
      initialProfile={
        profile?.notice_version === STUDENT_NOTICE_VERSION ? profile : null
      }
      school={school}
      initialScreen={screen}
    />
  );
}
