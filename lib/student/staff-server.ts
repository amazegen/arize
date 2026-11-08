import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isStudentEdition } from "./policy";
import { staffAssurance } from "./staff-assurance";
import { dateKey, validId } from "./features";
import { STAFF_ROLES, staffDashboardDTO, type StaffRole, type SupportRequest, type SchoolReport } from "./staff";

export async function getStaffSession(schoolId?: string | null) {
  if (schoolId && !validId(schoolId)) return { ok: false as const, status: 400, error: 'Choose a valid school.' };
  if (!isStudentEdition()) return { ok: false as const, status: 404, error: "Not found" };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return { ok: false as const, status: 503, error: "Staff access is not configured." };
  const supabase = await createClient(schoolId);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Please sign in with your staff account." };
  const assurance = await staffAssurance(supabase);
  if (!assurance.ok) return { ok: false as const, status: assurance.status, error: assurance.error };
  const { data: membership, error: memberError } = await supabase.from("student_staff_memberships")
    .select("school_id,role").eq("user_id", user.id).eq("active", true).maybeSingle();
  if (memberError) return { ok: false as const, status: 503, error: "Staff administration is not available yet." };
  if (!membership || !STAFF_ROLES.includes(membership.role as StaffRole))
    return { ok: false as const, status: 403, error: "An approved staff role is required." };
  const { data: scope, error: scopeError } = await supabase.rpc('student_staff_scope');
  if (scopeError || !scope || (schoolId && scope.schoolId !== schoolId)) return { ok: false as const, status: 403, error: "This school is not assigned to your account, or your staff access needs verification." };
  return { ok: true as const, supabase, user, role: membership.role as StaffRole, schoolId: scope.schoolId as string, schools: scope.schools as { id: string; name: string }[], schoolName: scope.schoolName as string, calendar: { timeZone: scope.timeZone as string, today: dateKey(new Date(),scope.timeZone) } };
}
export async function loadStaffDashboard(session: Extract<Awaited<ReturnType<typeof getStaffSession>>, { ok: true }>, offset = 0) {
  let requests: SupportRequest[] = [];
  let reports: SchoolReport[] = [];
  let reportingApproved = false;
  let hasMore = false;
  if (session.role === "therapist") {
    const { data, error } = await session.supabase.rpc("student_therapist_requests", { p_offset: offset });
    if (error) return null;
    const rows = (data?.requests ?? []) as SupportRequest[];
    requests = rows.slice(0, 50); hasMore = rows.length > 50;
  } else {
    const approval = await session.supabase.rpc("student_staff_reporting_status");
    if (approval.error) return null;
    reportingApproved = approval.data === true;
    if (reportingApproved) {
      const result = await session.supabase.from("student_school_reports").select("month,report,published_at").order("month", { ascending: false }).limit(12);
      if (result.error) return null;
      reports = (result.data ?? []) as SchoolReport[];
    }
  }
  return staffDashboardDTO({ role: session.role, schoolId: session.schoolId, schools: session.schools, schoolName: session.schoolName, calendar: session.calendar, requests, hasMore, reports, reportingApproved });
}
