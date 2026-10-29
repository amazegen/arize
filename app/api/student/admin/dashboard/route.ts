import { getStaffSession, loadStaffDashboard } from "@/lib/student/staff-server";
import { validFollowup } from "@/lib/student/staff";
import { validId, pageOffset } from "@/lib/student/features";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: studentNoStore });
export async function GET(request: Request) {
  const session = await getStaffSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const offset = pageOffset(new URL(request.url).searchParams.get("offset"));
  if (offset === null || offset > 10000) return reply({ error: "Choose a valid request page." }, 400);
  const data = await loadStaffDashboard(session, offset);
  return data ? reply(data) : reply({ error: "Your dashboard could not be loaded." }, 503);
}
export async function PATCH(request: Request) {
  const session = await getStaffSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (session.role !== "therapist") return reply({ error: "Therapist access required." }, 403);
  const body = await readStudentBody(request);
  if (!body || !validId(body.requestId) || !validFollowup(body.stage))
    return reply({ error: "Choose a valid request and follow-up status." }, 400);
  const { error } = await session.supabase.rpc("student_update_followup", { p_request_id: body.requestId, p_stage: body.stage });
  if (error) return reply({ error: "The request could not be updated. Reload and check your access." }, 503);
  return reply({ ok: true });
}
