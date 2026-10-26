import {
  getStudentSession,
  readStudentBody,
  studentNoStore,
} from "@/lib/student/server";
import { STUDENT_NOTICE_VERSION, validDay } from "@/lib/student/policy";
import {
  dateKey,
  GOAL_FIELDS,
  pageOffset,
  shiftDay,
  validId,
  validateGoal,
  weekStart,
} from "@/lib/student/features";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });

export async function GET(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const { supabase, user } = session;
  const params = new URL(request.url).searchParams;
  if (params.get("view") === "patterns") {
    const days = params.get("days") ?? "30";
    const offset = pageOffset(params.get("offset"));
    if (!["7", "30", "90", "all"].includes(days) || offset === null)
      return reply({ error: "Choose a valid history range." }, 400);
    let query = supabase
      .from("student_check_ins")
      .select("day,score")
      .eq("user_id", user.id)
      .lte("day", dateKey())
      .order("day", { ascending: false });
    if (days !== "all")
      query = query.gte("day", shiftDay(dateKey(), 1 - Number(days)));
    const { data, error } = await query.range(offset, offset + 100);
    if (error)
      return reply({ error: "Your Pattern Map could not be loaded." }, 503);
    return reply({
      checkIns: (data ?? []).slice(0, 100),
      hasMore: (data?.length ?? 0) > 100,
      nextOffset: offset + 100,
    });
  }
  const week = params.get("week");
  if (!validDay(week) || weekStart(week) !== week)
    return reply({ error: "Choose a valid week." }, 400);
  const { data, error } = await supabase
    .from("student_goals")
    .select(GOAL_FIELDS)
    .eq("user_id", user.id)
    .eq("week_of", week)
    .is("archived_at", null)
    .order("created_at")
    .order("id")
    .limit(1001);
  if (error) return reply({ error: "Your goals could not be loaded." }, 503);
  if ((data?.length ?? 0) > 1000)
    return reply(
      {
        error:
          "This week has too many goals to display. Please contact the pilot coordinator.",
      },
      413,
    );
  return reply({ goals: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const body = await readStudentBody(request);
  if (!body) return reply({ error: "A valid goal request is required." }, 400);
  const { supabase, user } = session;
  const { data: profile } = await supabase
    .from("student_profiles")
    .select("notice_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.notice_version !== STUDENT_NOTICE_VERSION)
    return reply({ error: "Please complete student onboarding first." }, 403);
  if (body.action === "save-goal") {
    const checked = validateGoal(body);
    if (!checked.ok) return reply({ error: checked.error }, 400);
    if (body.id !== undefined && !validId(body.id))
      return reply({ error: "Choose a valid goal." }, 400);
    // Update only the edited fields: never reset completion/progress while editing.
    const result = body.id
      ? await supabase
          .from("student_goals")
          .update(checked.goal)
          .eq("id", body.id)
          .eq("user_id", user.id)
          .is("archived_at", null)
          .select(GOAL_FIELDS)
          .maybeSingle()
      : await supabase
          .from("student_goals")
          .insert({ ...checked.goal, user_id: user.id })
          .select(GOAL_FIELDS)
          .single();
    if (result.error)
      return reply({ error: "Your goal could not be saved." }, 503);
    return result.data
      ? reply({ goal: result.data })
      : reply({ error: "Goal not found." }, 404);
  }
  if (!validId(body.id)) return reply({ error: "Choose a valid goal." }, 400);
  let changes: Record<string, unknown>;
  if (body.action === "complete-goal" && typeof body.complete === "boolean")
    changes = { is_complete: body.complete, progress: body.complete ? 100 : 0 };
  else if (body.action === "archive-goal" && typeof body.archive === "boolean")
    changes = { archived_at: body.archive ? new Date().toISOString() : null };
  else return reply({ error: "Choose a valid goal action." }, 400);
  const { data, error } = await supabase
    .from("student_goals")
    .update(changes)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select(GOAL_FIELDS)
    .maybeSingle();
  if (error) return reply({ error: "Your goal could not be updated." }, 503);
  return data
    ? reply({ goal: data })
    : reply({ error: "Goal not found." }, 404);
}
