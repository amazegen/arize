import { createClient } from "@supabase/supabase-js";
import { getOperationsSession } from "@/lib/student/operations-server";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
import { validSchoolName, validStaffInvite } from "@/lib/student/operator";

export async function POST(request: Request) {
  const session = await getOperationsSession();
  if (!session.ok) return Response.json({ error: session.error }, { status: session.status, headers: studentNoStore });
  if (!session.state.operator) return Response.json({ error: "Project administrator access required." }, { status: 403, headers: studentNoStore });
  const body = await readStudentBody(request);
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: studentNoStore });
  if (!body || !["school", "invite"].includes(String(body.action))) return reply({ error: "Choose a valid management action." }, 400);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return reply({ error: "Project management is temporarily unavailable." }, 503);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (body.action === "school") {
    if (!validSchoolName(body.name) || body.confirmed !== true) return reply({ error: "Enter a school name and confirm this is a school record, not a student." }, 400);
    const name = body.name.trim();
    const { data: existing, error: readError } = await admin.from("student_schools").select("id,name").eq("name", name).limit(1);
    if (readError) return reply({ error: "Could not check existing schools. Nothing was added." }, 503);
    if (existing?.length) return reply({ error: "A school with that exact name already exists. Select it from the school list." }, 409);
    const { error } = await admin.from("student_schools").insert({ name });
    if (error) return reply({ error: "Could not create the school. Please try again." }, 503);
    return reply({ message: "School added. Data collection and reporting remain off until you record its approved scope." });
  }
  if (!validStaffInvite(body.email) || body.confirmed !== true) return reply({ error: "Enter one adult work email and confirm the recipient." }, 400);
  const { error } = await admin.auth.admin.inviteUserByEmail(body.email.trim().toLowerCase(), { redirectTo: "https://students.arizeapp.com/auth/callback?next=%2Fstudent%2Fstaff" });
  if (error) return reply({ error: "The invitation could not be sent. If this account already exists, ask them to use password setup or staff sign-in. No permissions were changed." }, 400);
  return reply({ message: "Invitation sent with Arize account-setup instructions. The recipient must set a password and submit their role request; you still review access separately." });
}
