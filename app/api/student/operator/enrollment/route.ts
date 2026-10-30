import { createClient } from "@supabase/supabase-js";
import { getOperationsSession } from "@/lib/student/operations-server";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
import { validStaffInvite } from "@/lib/student/operator";
import { validId } from "@/lib/student/features";
export async function POST(request: Request) {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: studentNoStore });
  const session = await getOperationsSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (!session.state.operator) return reply({ error: "Project administrator access required." }, 403);
  const body = await readStudentBody(request);
  if (!body || !validStaffInvite(body.email) || !["lookup", "invite", "active", "revoked"].includes(String(body.action))) return reply({ error: "Enter one student account email and a valid action." }, 400);
  const found = await session.supabase.rpc("student_find_enrollment", { p_email: body.email.trim().toLowerCase() });
  if (found.error) return reply({ error: "Enrollment management is unavailable. No access was changed." }, 503);
  if (body.action === "lookup") return reply({ enrollment: found.data });
  if (!validId(body.schoolId) || typeof body.reference !== "string" || body.reference.trim().length < 3 || body.reference.length > 200 || body.confirmed !== true) return reply({ error: "Choose the verified school, record a review reference, and confirm this action." }, 400);
  if (found.data?.adultRole) return reply({ error: "This is an adult staff account. Use a separate verified student account." }, 409);
  let userId = found.data?.userId;
  let invitationSent = false;
  if (body.action === "invite") {
    if (found.data?.status) return reply({ error: "An enrollment already exists. Use password setup to recover that account; no duplicate invitation was sent." }, 409);
    if (!userId) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return reply({ error: "Invitations are not configured." }, 503);
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const invited = await admin.auth.admin.inviteUserByEmail(body.email.trim().toLowerCase(), { redirectTo: "https://students.arizeapp.com/auth/callback" });
      if (invited.error || !invited.data.user) return reply({ error: "The invitation could not be sent. No enrollment was approved." }, 503);
      userId = invited.data.user.id; invitationSent = true;
    }
  } else if (!userId || !found.data.status) return reply({ error: "Find or invite the student's existing enrollment first." }, 400);
  const changed = await session.supabase.rpc("student_manage_enrollment", { p_user: userId, p_school: body.schoolId, p_status: body.action === "invite" ? "invited" : body.action, p_reference: body.reference.trim(), p_confirmed: true });
  if (changed.error) return reply({ error: invitationSent ? "The invitation email was sent, but enrollment could not be saved. Do not resend blindly—look up the account and review the school assignment. No student access was approved." : "Enrollment could not be changed. Check the school assignment and verified review reference." }, 409);
  return reply({ message: body.action === "invite" ? invitationSent ? "Invitation sent. Student access stays pending until you separately verify consent and activate enrollment." : "Existing account attached as pending enrollment. No email was sent. Ask the student to use their existing password or password setup." : body.action === "active" ? "Enrollment activated with your consent-review reference. Student onboarding is still required." : "Student access revoked. Records were retained; no deletion was performed." });
}
