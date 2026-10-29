import OpenAI from "openai";
import { createHash } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getStudentSession,
  readStudentBody,
  studentNoStore,
} from "@/lib/student/server";
import { STUDENT_NOTICE_VERSION } from "@/lib/student/policy";
import { studentCoachPrompt } from "@/lib/student/coach";
import { studentSafetyReply } from "@/lib/student/safety";
import { studentProviderFailure } from "@/lib/student/provider-errors";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });

export async function GET(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const id = new URL(request.url).searchParams.get("conversation");
  if (!id || !/^[a-f0-9-]{36}$/i.test(id))
    return reply({ error: "Choose a conversation." }, 400);
  const { data, error } = await session.supabase
    .from("student_messages")
    .select("role, content")
    .eq("user_id", session.user.id)
    .eq("conversation_id", id)
    .order("created_at")
    .limit(200);
  if (error)
    return reply({ error: "Your conversation could not be loaded." }, 503);
  return reply({ messages: data });
}

export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const body = await readStudentBody(request);
  if (
    body?.language !== undefined &&
    body.language !== "en" &&
    body.language !== "es"
  )
    return reply({ error: "Choose English or Spanish." }, 400);
  const language = body?.language === "es" ? "es" : "en";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const conversationId = body?.conversationId ?? null;
  if (
    !body ||
    !content ||
    content.length > 2000 ||
    (conversationId !== null &&
      (typeof conversationId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(conversationId)))
  )
    return reply({ error: "Send a message of 1–2,000 characters." }, 400);
  const { supabase, user } = session;
  const { data: profile } = await supabase
    .from("student_profiles")
    .select("notice_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.notice_version !== STUDENT_NOTICE_VERSION)
    return reply({ error: "Please complete student onboarding first." }, 403);
  // Separate explicit gate: prompts alone are not an under-18 safety program.
  // Keep AI off until provider retention, school consent, and safety tests are approved.
  if (
    process.env.STUDENT_AI_ENABLED !== "true" ||
    !process.env.STUDENT_COACH_MODEL ||
    !process.env.OPENAI_API_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return reply(
      {
        error:
          "Student Clarity is not enabled for this pilot yet. You can still use Talk to your counselor.",
      },
      503,
    );
  }
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 1,
  });
  try {
    const moderation = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: content,
    });
    const classification = moderation.results[0];
    if (!classification) throw new Error("Missing safety classification");
    const safetyReply = studentSafetyReply(
      {
        flagged: classification.flagged,
        categories: { ...classification.categories },
      },
      language,
    );
    // No blocked raw text is stored in student history or sent to the coach.
    if (safetyReply)
      return reply({
        message: { role: "assistant", content: safetyReply },
        moderated: true,
      });
  } catch (error) {
    console.error(studentProviderFailure("input-moderation", error));
    return reply(
      {
        error:
          "Student safety checks are unavailable. No message was saved. Please try later or talk to your counselor.",
      },
      503,
    );
  }
  const { data: id, error: turnError } = await supabase.rpc(
    "student_reserve_coach_turn",
    { p_conversation_id: conversationId, p_content: content },
  );
  if (turnError || typeof id !== "string")
    return reply(
      {
        error:
          turnError?.code === "P0002"
            ? "You have reached the pilot message limit. Please try again later or talk to your counselor."
            : "This message could not be saved. Please try again.",
      },
      turnError?.code === "P0002" ? 429 : 503,
    );
  const { data: history, error: historyError } = await supabase
    .from("student_messages")
    .select("role, content")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);
  if (historyError)
    return reply(
      {
        error:
          "Your message was saved, but Clarity could not load this conversation.",
        conversationId: id,
      },
      503,
    );
  try {
    const result = await openai.chat.completions.create({
      model: process.env.STUDENT_COACH_MODEL,
      store: false,
      // A pseudonymous identifier: never send the student's email or name.
      safety_identifier: createHash("sha256")
        .update(`arize-student/${user.id}`)
        .digest("hex"),
      reasoning_effort: "low",
      messages: [
        { role: "system", content: studentCoachPrompt(language) },
        ...(history ?? []).reverse().map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
      ],
      // Includes reasoning tokens. Keep enough room for a short visible answer.
      max_completion_tokens: 1200,
    });
    const response = result.choices[0]?.message.content?.trim();
    if (!response) throw new Error("Empty reply");
    const moderatedOutput = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: response,
    });
    const classification = moderatedOutput.results[0];
    if (!classification)
      throw new Error("Missing output safety classification");
    const safeResponse =
      studentSafetyReply(
        {
          flagged: classification.flagged,
          categories: { ...classification.categories },
        },
        language,
      ) ?? response;
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: saveError } = await admin.rpc("student_save_coach_reply", {
      p_user_id: user.id,
      p_conversation_id: id,
      p_content: safeResponse,
    });
    if (saveError)
      return reply(
        {
          error:
            "Your message was saved, but the reply could not be saved. Please reload your history before trying again.",
          conversationId: id,
        },
        503,
      );
    return reply({
      conversationId: id,
      message: { role: "assistant", content: safeResponse },
    });
  } catch (error) {
    // Never log student text, provider request bodies, or credentials.
    console.error(studentProviderFailure("generation-or-output-moderation", error));
    return reply(
      {
        error:
          "Your message was saved, but Clarity is unavailable. Please try later or contact your counselor.",
        conversationId: id,
      },
      503,
    );
  }
}
