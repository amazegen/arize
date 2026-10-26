import { getStudentSession, studentNoStore } from "@/lib/student/server";
import { pageOffset, validId } from "@/lib/student/features";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });
export async function GET(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const { supabase, user } = session;
  const params = new URL(request.url).searchParams;
  const offset = pageOffset(params.get("offset"));
  if (offset === null)
    return reply({ error: "Choose a valid history page." }, 400);
  const id = params.get("conversation");
  if (id !== null) {
    if (!validId(id))
      return reply({ error: "Choose a valid conversation." }, 400);
    const { data: owned, error: ownershipError } = await supabase
      .from("student_conversations")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle();
    if (ownershipError)
      return reply({ error: "History is temporarily unavailable." }, 503);
    if (!owned) return reply({ error: "Conversation not found." }, 404);
    const { data, error } = await supabase
      .from("student_messages")
      .select("id,role,content,created_at")
      .eq("user_id", user.id)
      .eq("conversation_id", id)
      .order("created_at")
      .order("id")
      .range(offset, offset + 100);
    if (error)
      return reply({ error: "Your conversation could not be loaded." }, 503);
    return reply({
      messages: (data ?? []).slice(0, 100),
      hasMore: (data?.length ?? 0) > 100,
      nextOffset: offset + 100,
    });
  }
  const { data, error } = await supabase
    .from("student_conversations")
    .select("id,title,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 20);
  if (error) return reply({ error: "Your history could not be loaded." }, 503);
  return reply({
    conversations: (data ?? []).slice(0, 20),
    hasMore: (data?.length ?? 0) > 20,
    nextOffset: offset + 20,
  });
}
