import {
  getStudentSession,
  readStudentBody,
  studentNoStore,
} from "@/lib/student/server";
import { STUDENT_NOTICE_VERSION } from "@/lib/student/policy";
import { validateBelonging } from "@/lib/student/belonging";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });
export async function GET() {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (process.env.STUDENT_BELONGING_ENABLED !== "true")
    return reply({ enabled: false, history: [] });
  const { data, error } = await session.supabase
    .from("student_belonging_pulses")
    .select("week_of,welcome,trusted_adult,connection")
    .eq("user_id", session.user.id)
    .order("week_of", { ascending: false })
    .limit(26);
  return error
    ? reply({ error: "The belonging survey is unavailable." }, 503)
    : reply({ enabled: true, history: data });
}
export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (process.env.STUDENT_BELONGING_ENABLED !== "true")
    return reply(
      {
        error:
          "This optional survey needs school approval before collection can begin. Nothing was saved.",
      },
      503,
    );
  const body = await readStudentBody(request);
  if (!body) return reply({ error: "Invalid survey." }, 400);
  const validated = validateBelonging(body);
  if (!validated.ok) return reply({ error: validated.error }, 400);
  const { data: profile } = await session.supabase
    .from("student_profiles")
    .select("notice_version")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (profile?.notice_version !== STUDENT_NOTICE_VERSION)
    return reply({ error: "Complete student onboarding first." }, 403);
  const { error } = await session.supabase.rpc("student_save_belonging", {
    p_welcome: validated.scores.welcome,
    p_trusted_adult: validated.scores.trusted_adult,
    p_connection: validated.scores.connection,
    p_language: validated.language,
  });
  return error
    ? reply(
        { error: "Your response could not be saved. Please try later." },
        503,
      )
    : reply({ saved: true });
}
