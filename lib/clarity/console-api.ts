import "server-only";
import OpenAI from "openai";
import { configText, validateConfig, type ClarityEdition, type ClarityConfig } from "./config";
import { consoleHeaders, consoleSession, readConsoleBody } from "./server";
import { sameOrigin } from "./request-origin";
import { safeCompletion, providerFailure, type Moderation } from "./safety";
import { validateCoachRequest } from "@/lib/coach/request";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: consoleHeaders });
const uuid = (value: unknown): value is string => typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export async function configAPI(request: Request, edition: ClarityEdition) {
  const session = await consoleSession(edition);
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (request.method === "GET") {
    const page = Number(new URL(request.url).searchParams.get("page") ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 100000) return reply({ error: "Choose a valid history page." }, 400);
    const result = await session.supabase.rpc("clarity_console_state", { p_edition: edition, p_page: page });
    return result.error ? reply({ error: "Configuration history could not be loaded." }, 503) : reply(result.data);
  }
  if (!sameOrigin(request)) return reply({ error: "Use this app’s configuration console." }, 403);
  const body = await readConsoleBody(request);
  if (!body || !["save", "publish", "restore"].includes(String(body.action))) return reply({ error: "Choose save, publish or restore." }, 400);
  const action = body.action as string;
  if (action !== "save" && (!uuid(body.version) || (body.expected !== null && !uuid(body.expected)))) return reply({ error: "Choose a valid version and reload the current publication." }, 400);
  const validated = action === "save" ? validateConfig(body.config) : null;
  if (validated && !validated.ok) return reply({ error: validated.error }, 400);
  if (action !== "publish" && (typeof body.note !== "string" || !body.note.trim() || body.note.length > 500)) return reply({ error: "Add a change note of 1–500 characters." }, 400);
  const result = await session.supabase.rpc("clarity_change_config", {
    p_edition: edition, p_action: action, p_config: validated?.ok ? validated.config : null,
    p_note: action !== "publish" ? body.note : null, p_version: action !== "save" ? body.version : null,
    p_expected: action !== "save" ? body.expected : null,
  });
  if (result.error) return reply({ error: result.error.code === "40001" ? "Another administrator published a change. Reload before publishing or restoring." : "Your change could not be saved. Check your access and reload." }, result.error.code === "40001" ? 409 : result.error.code === "42501" ? 403 : 503);
  return reply({ version: result.data });
}
export async function previewAPI(request: Request, edition: ClarityEdition, prompt: (language: "en" | "es", config: ClarityConfig) => string, safetyReply: (result: Moderation, language: "en" | "es") => string | null) {
  const session = await consoleSession(edition);
  if (!session.ok) return reply({ error: session.error }, session.status);
  if (!sameOrigin(request)) return reply({ error: "Use this app’s configuration console." }, 403);
  const body = await readConsoleBody(request);
  const checked = validateConfig(body?.config);
  const messages = validateCoachRequest(body);
  if (!body || !checked.ok || !messages.ok || messages.messages.length > 8 || messages.messages.reduce((n, m) => n + m.content.length, 0) > 6500 || body.fictional !== true || !uuid(body.requestId) || !["en", "es"].includes(String(body.language))) return reply({ error: "Use a valid configuration and fictional examples only (up to eight turns / 6,500 characters)." }, 400);
  const model = edition === "student" ? process.env.STUDENT_COACH_MODEL : "gpt-4o-mini";
  if (!process.env.OPENAI_API_KEY || !model || (edition === "student" && process.env.STUDENT_AI_ENABLED !== "true")) return reply({ error: "AI preview is not enabled in this environment. No credentials are changed by this console." }, 503);
  const quota = await session.supabase.rpc("clarity_claim_preview", { p_edition: edition, p_request: body.requestId });
  if (quota.error) return reply({ error: "Preview authorization or usage checks are temporarily unavailable." }, quota.error.code === "42501" ? 403 : 503);
  if (quota.data !== true) return reply({ error: "Preview limit reached or this request was already used. Wait before starting a new test." }, 429);
  const language = body.language === "es" ? "es" : "en";
  const signal = AbortSignal.timeout(40_000);
  // Each isolated deployment uses only its own pre-existing OPENAI_API_KEY.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 0 });
  try {
    const result = await safeCompletion(messages.messages, async input => {
      const data = await openai.moderations.create({ model: "omni-moderation-latest", input }, { signal });
      if (!data.results[0]) throw new Error("Missing classification");
      return { flagged: data.results[0].flagged, categories: { ...data.results[0].categories } };
    }, async () => {
      const data = await openai.chat.completions.create({ model, store: false, max_completion_tokens: edition === "student" ? 1200 : 500,
        ...(edition === "student" ? { reasoning_effort: "low" as const } : { temperature: 0.7 }),
        messages: [{ role: "system", content: `${prompt(language, checked.config)}\n\n${configText(checked.config)}` }, ...messages.messages],
      }, { signal });
      return data.choices[0]?.message.content ?? "";
    }, result => safetyReply(result, language));
    // Fictional test text is not stored, logged or added to student history/analytics.
    return reply(result);
  } catch (error) {
    console.error(providerFailure("configuration-preview", error));
    return reply({ error: "Preview could not complete. No unchecked response was shown. Try again later." }, 503);
  }
}
