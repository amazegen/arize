import { getOperationsSession } from "@/lib/student/operations-server";
import { REQUESTABLE_STAFF_ROLES, validAttendance, operatorOverviewDTO } from "@/lib/student/operations";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
import { validDay } from "@/lib/student/policy";
import { validId } from "@/lib/student/features";
import { RESET_LESSONS } from "@/lib/student/learning";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: studentNoStore });
export async function GET() {
  const session = await getOperationsSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  let overview = null;
  if (session.state.operator) {
    const result = await session.supabase.rpc("student_operator_overview");
    if (result.error) return reply({ error: "Business overview could not be loaded." }, 503);
    overview = operatorOverviewDTO(result.data);
  }
  return reply({ state: session.state, overview });
}
export async function POST(request: Request) {
  const session = await getOperationsSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const b = await readStudentBody(request);
  if (!b) return reply({ error: "Invalid request." }, 400);
  const text = (v: unknown, min: number, max: number) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
  let rpc: string; let args: Record<string, unknown>;
  switch (b.action) {
    case "apply":
      if (!text(b.name, 1, 80) || !text(b.school, 2, 160) || !REQUESTABLE_STAFF_ROLES.includes(b.role as typeof REQUESTABLE_STAFF_ROLES[number]) || b.acknowledged !== true) return reply({ error: "Complete the role, name, school and staff acknowledgement." }, 400);
      rpc = "student_apply_staff"; args = { p_name: b.name, p_school: b.school, p_role: b.role }; break;
    case "class":
      if (session.state.role !== "teacher") return reply({ error: "Teacher access required." }, 403);
      if (!text(b.label, 1, 80)) return reply({ error: "Enter a class label without student names." }, 400);
      rpc = "student_create_class"; args = { p_label: b.label }; break;
    case "attendance":
      if (session.state.role !== "teacher") return reply({ error: "Teacher access required." }, 403);
      if (!validId(b.classId) || !validDay(b.day) || !validAttendance(b) || (b.lesson !== null && !RESET_LESSONS.some((l) => l.id === b.lesson))) return reply({ error: "Check the class, date and counts. Present + absent must equal enrolled." }, 400);
      rpc = "student_save_class_record"; args = { p_class: b.classId, p_day: b.day, p_enrolled: b.enrolled, p_present: b.present, p_absent: b.absent, p_lesson: b.lesson }; break;
    case "ambassadors":
      if (session.state.role !== "school_staff") return reply({ error: "School administrator access required." }, 403);
      if (!validDay(b.month) || !String(b.month).endsWith("-01") || ![b.interested, b.oriented, b.active].every((v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 10000) || Number(b.active) > Number(b.oriented) || Number(b.oriented) > Number(b.interested)) return reply({ error: "Check the month and program totals." }, 400);
      rpc = "student_save_ambassador_counts"; args = { p_month: b.month, p_interested: b.interested, p_oriented: b.oriented, p_active: b.active }; break;
    case "publish":
      if (session.state.role !== "school_staff" && !session.state.operator) return reply({ error: "Report publication access required." }, 403);
      if (!validDay(b.month) || !String(b.month).endsWith("-01") || (b.schoolId != null && !validId(b.schoolId))) return reply({ error: "Choose a completed month." }, 400);
      rpc = "student_publish_completed_period"; args = { p_month: b.month, p_school: session.state.operator ? b.schoolId : null }; break;
    case "review":
      if (!session.state.operator) return reply({ error: "Operator access required." }, 403);
      if (!validId(b.userId) || (b.schoolId !== null && !validId(b.schoolId)) || typeof b.approve !== "boolean" || (b.approve && b.verified !== true)) return reply({ error: "Verify identity and school authority before approving a role." }, 400);
      rpc = "student_review_staff"; args = { p_user: b.userId, p_school: b.schoolId, p_approve: b.approve, p_verified: b.verified === true }; break;
    case "revoke":
      if (!session.state.operator) return reply({ error: "Operator access required." }, 403);
      if (!validId(b.userId) || b.confirmed !== true) return reply({ error: "Confirm the staff access revocation." }, 400);
      rpc = "student_revoke_staff"; args = { p_user: b.userId }; break;
    case "authorize":
      if (!session.state.operator) return reply({ error: "Operator access required." }, 403);
      if (!validId(b.schoolId) || !text(b.reference, 3, 200) || b.confirmed !== true || ![b.attendance, b.topics, b.belonging, b.ambassadors, b.reporting].every((v) => typeof v === "boolean")) return reply({ error: "Record the school authorization reference and approved features." }, 400);
      rpc = "student_authorize_school"; args = { p_school: b.schoolId, p_reference: b.reference, p_attendance: b.attendance, p_topics: b.topics, p_belonging: b.belonging, p_ambassadors: b.ambassadors, p_reporting: b.reporting }; break;
    default: return reply({ error: "Unknown action." }, 400);
  }
  const result = await session.supabase.rpc(rpc, args);
  if (result.error) return reply({ error: result.error.code === "42501" ? "Your role or the school's authorization does not permit this action." : "Could not save. Check the dates, counts and whether this reporting period is already frozen." }, result.error.code === "42501" ? 403 : 400);
  return reply({ saved: true });
}
