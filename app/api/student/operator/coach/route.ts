import OpenAI from "openai";
import { createHash } from "node:crypto";
import { getOperationsSession } from "@/lib/student/operations-server";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
import { validOperatorTest } from "@/lib/student/operator";
import { studentCoachPrompt, STUDENT_COACH_PROMPT_VERSION } from "@/lib/student/coach";
import { studentSafetyReply } from "@/lib/student/safety";
import { studentProviderFailure } from "@/lib/student/provider-errors";
import { trustedAIRequest, requestFailure, validRequestId } from "@/lib/student/ai-request-server";

export async function POST(request: Request) {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: studentNoStore });
  const session = await getOperationsSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (!session.state.operator) return reply({ error: "Project administrator access required." }, 403);
  const body = await readStudentBody(request, 32_768);
  if (!body || !validOperatorTest(body.messages) || !["en", "es"].includes(String(body.language)) || body.fictional !== true) return reply({ error: "Use fictional examples only. Each test supports up to eight turns and 6,500 total characters." }, 400);
  if (process.env.STUDENT_AI_ENABLED !== "true" || !process.env.OPENAI_API_KEY || !process.env.STUDENT_COACH_MODEL) return reply({ error: "Live Clarity testing is not enabled in this environment." }, 503);
  const language = body.language === "es" ? "es" : "en";
  if (body.requestId !== undefined && !validRequestId(body.requestId)) return reply({ error: "Invalid request identifier." }, 400);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return reply({ error: "Live testing is not configured." }, 503);
  const requestId = validRequestId(body.requestId) ? body.requestId : crypto.randomUUID();
  const turn = trustedAIRequest(session.user.id, requestId, "operator", { messages: body.messages, language });
  const begun = await turn.begin();
  if (begun.error) { const failure = requestFailure(begun.error.code); return reply({ error: failure.error }, failure.status); }
  if (["completed", "blocked"].includes(begun.data?.state)) return reply({ content: begun.data.content, moderated: begun.data.state === "blocked", version: STUDENT_COACH_PROMPT_VERSION });
  if (begun.data?.state !== "new") return reply({ error: "This test request is already processing or could not finish. Start a new test after checking the result." }, 409);
  const signal = AbortSignal.timeout(35_000);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 0 });
  try {
    const moderation = await openai.moderations.create({ model: "omni-moderation-latest", input: body.messages.map(m => m.content).join("\n") }, { signal });
    const classification = moderation.results[0];
    if (!classification) throw new Error("Missing moderation");
    const safety = studentSafetyReply({ flagged: classification.flagged, categories: { ...classification.categories } }, language);
    if (safety) {
      const saved = await turn.finish("blocked", safety);
      if (saved.error) throw new Error("Unable to record safe result");
      return reply({ content: safety, moderated: true, version: STUDENT_COACH_PROMPT_VERSION });
    }
    const result = await openai.chat.completions.create({
      model: process.env.STUDENT_COACH_MODEL, store: false, reasoning_effort: "low", max_completion_tokens: 1200,
      safety_identifier: createHash("sha256").update(`arize-operator-test/${session.user.id}`).digest("hex"),
      messages: [{ role: "system", content: studentCoachPrompt(language) }, ...body.messages],
    }, { signal });
    const content = result.choices[0]?.message.content?.trim();
    if (!content) throw new Error("Missing response");
    const output = await openai.moderations.create({ model: "omni-moderation-latest", input: content }, { signal });
    const checked = output.results[0];
    if (!checked) throw new Error("Missing output moderation");
    const safeContent = studentSafetyReply({ flagged: checked.flagged, categories: { ...checked.categories } }, language) ?? content;
    const saved = await turn.finish("completed", safeContent);
    if (saved.error) throw new Error("Unable to record safe result");
    return reply({ content: safeContent, version: STUDENT_COACH_PROMPT_VERSION });
  } catch (error) {
    console.error(studentProviderFailure("operator-fictional-test", error));
    await turn.finish("failed");
    return reply({ error: "Clarity’s test could not complete. Your test prompt was not saved. Change the draft or start a new test to try again." }, 503);
  }
}
