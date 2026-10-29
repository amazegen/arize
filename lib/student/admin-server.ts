import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isStudentEdition } from "./policy";
import { resolveCounselorRecipient } from "./notification-settings";

// A staff role is separate from student enrollment and checked fresh on each
// request. A user's editable name, email, or auth metadata never grants it.
export async function getNotificationAdminSession() {
  if (!isStudentEdition())
    return { ok: false as const, status: 404, error: "Not found" };
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return {
      ok: false as const,
      status: 503,
      error: "The student administration backend is not configured yet.",
    };
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return {
      ok: false as const,
      status: 401,
      error: "Please sign in with your staff account.",
    };
  const { data: staff, error: staffError } = await supabase
    .from("student_staff_memberships")
    .select("school_id,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  // School partners cannot inherit a legacy notification permission. Fail
  // closed if the new role table is unavailable or an incompatible role exists.
  if (staffError || (staff && staff.role !== "therapist"))
    return { ok: false as const, status: staffError ? 503 : 403,
      error: "Counselor notification access is unavailable for this account." };
  const { data: legacy, error } = await supabase
    .from("student_notification_admins")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  const scope = staff ?? legacy;
  if (error)
    return {
      ok: false as const,
      status: 503,
      error: "Notification administration is temporarily unavailable.",
    };
  if (!scope)
    return {
      ok: false as const,
      status: 403,
      error: "An approved notification-administrator account is required.",
    };
  const { data: school } = await supabase
    .from("student_schools")
    .select("name")
    .eq("id", scope.school_id)
    .maybeSingle();
  if (!school)
    return {
      ok: false as const,
      status: 503,
      error: "Your school administration settings are unavailable.",
    };
  return {
    ok: true as const,
    supabase,
    user,
    schoolId: scope.school_id as string,
    schoolName: school.name as string,
  };
}

export async function loadNotificationSettings(
  session: Extract<
    Awaited<ReturnType<typeof getNotificationAdminSession>>,
    { ok: true }
  >,
) {
  const [setting, audit] = await Promise.all([
    session.supabase
      .from("student_counselor_settings")
      .select("recipient_email,updated_at")
      .eq("school_id", session.schoolId)
      .maybeSingle(),
    session.supabase
      .from("student_counselor_email_audit")
      .select("id,old_email,new_email,changed_at")
      .eq("school_id", session.schoolId)
      .order("changed_at", { ascending: false })
      .limit(10),
  ]);
  if (setting.error || audit.error) return null;
  return {
    email: resolveCounselorRecipient({
      databaseEmail: setting.data?.recipient_email ?? null,
      schoolId: session.schoolId,
      legacyEmail: process.env.STUDENT_COUNSELOR_EMAIL,
      legacySchoolId: process.env.STUDENT_COUNSELOR_SCHOOL_ID,
    }),
    updatedAt: setting.data?.updated_at ?? null,
    history: audit.data ?? [],
  };
}
