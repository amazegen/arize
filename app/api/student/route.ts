import {
  getStudentSession,
  readStudentBody,
  studentNoStore,
} from "@/lib/student/server";
import {
  STUDENT_NOTICE_VERSION,
  validDay,
  validateCheckIn,
  validateStudentProfile,
} from "@/lib/student/policy";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });

export async function GET(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const day = new URL(request.url).searchParams.get("day");
  if (!validDay(day)) return reply({ error: "Choose a valid day." }, 400);
  const { supabase, user } = session;
  const [checkIn, goals, conversations] = await Promise.all([
    supabase
      .from("student_check_ins")
      .select("score, day")
      .eq("user_id", user.id)
      .eq("day", day)
      .maybeSingle(),
    supabase
      .from("student_goals")
      .select("id, title, is_complete, day")
      .eq("user_id", user.id)
      .eq("day", day)
      .order("created_at"),
    supabase
      .from("student_conversations")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (checkIn.error || goals.error || conversations.error)
    return reply(
      { error: "Your student activity could not be loaded. Please try again." },
      503,
    );
  return reply({
    checkIn: checkIn.data,
    goals: goals.data,
    conversations: conversations.data,
  });
}

export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const body = await readStudentBody(request);
  if (!body) return reply({ error: "The request is not valid." }, 400);
  const { supabase, user } = session;
  if (body.action === "profile") {
    const error = validateStudentProfile(body);
    if (error) return reply({ error }, 400);
    const result = await supabase
      .from("student_profiles")
      .upsert({
        user_id: user.id,
        display_name: String(body.displayName).trim(),
        grade: body.grade,
        notice_version: STUDENT_NOTICE_VERSION,
        acknowledged_at: new Date().toISOString(),
      })
      .select("display_name, grade, notice_version")
      .single();
    if (result.error)
      return reply({ error: "Your profile could not be saved." }, 503);
    return reply({ profile: result.data });
  }
  const { data: profile } = await supabase
    .from("student_profiles")
    .select("notice_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.notice_version !== STUDENT_NOTICE_VERSION)
    return reply({ error: "Please complete student onboarding first." }, 403);
  if (body.action === "check-in") {
    const error = validateCheckIn(body);
    if (error) return reply({ error }, 400);
    const result = await supabase
      .from("student_check_ins")
      .upsert(
        { user_id: user.id, day: body.day, score: body.score },
        { onConflict: "user_id,day" },
      );
    return result.error
      ? reply({ error: "Your check-in could not be saved." }, 503)
      : reply({ ok: true });
  }
  if (body.action === "add-goal") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!validDay(body.day) || !title || title.length > 160)
      return reply(
        { error: "Choose a day and a goal of 1–160 characters." },
        400,
      );
    // INSERT only: adding a goal never replaces or resets existing goals.
    const result = await supabase
      .from("student_goals")
      .insert({ user_id: user.id, day: body.day, title })
      .select("id, title, is_complete, day")
      .single();
    return result.error
      ? reply({ error: "Your goal could not be added." }, 503)
      : reply({ goal: result.data });
  }
  if (body.action === "toggle-goal") {
    if (
      typeof body.id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(body.id) ||
      typeof body.complete !== "boolean"
    )
      return reply({ error: "Choose a valid goal." }, 400);
    const result = await supabase
      .from("student_goals")
      .update({ is_complete: body.complete })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("id, title, is_complete, day")
      .maybeSingle();
    if (result.error)
      return reply({ error: "Your goal could not be updated." }, 503);
    return result.data
      ? reply({ goal: result.data })
      : reply({ error: "Goal not found." }, 404);
  }
  return reply({ error: "Unknown student action." }, 400);
}
