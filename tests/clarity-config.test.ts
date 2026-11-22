import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG_FIELDS, DEFAULT_CONFIG, configText, validateConfig } from "../lib/clarity/config.ts";
import { ADULT_SAFETY, adultSafetyReply, providerFailure, safeCompletion } from "../lib/clarity/safety.ts";
import { sameOrigin } from "../lib/clarity/request-origin.ts";
const clean = { flagged: false, categories: {} };
const selfHarm = { flagged: true, categories: { "self-harm/intent": true } };
test("mutations accept the public Host despite Next's internal URL, and reject foreign/missing origins", () => {
  const make = (origin?: string, host = "127.0.0.1:3149") => new Request("http://localhost:3149/api/admin/clarity", { headers: { host, ...(origin ? { origin } : {}) } });
  assert.equal(sameOrigin(make("http://127.0.0.1:3149")), true);
  for (const origin of [undefined, "null", "https://evil.example", "http://127.0.0.1:3159", "https://127.0.0.1:3149", "http://127.0.0.1:3149/path"]) assert.equal(sameOrigin(make(origin)), false);
});
test("configuration accepts only six bounded writing fields, not secrets or safety controls", () => {
  for (const edition of ["adult", "student"] as const) assert.equal(validateConfig(DEFAULT_CONFIG[edition]).ok, true);
  for (const value of [null, [], {}, { ...DEFAULT_CONFIG.adult, apiKey: "secret" }, { ...DEFAULT_CONFIG.adult, tone: " " }, { ...DEFAULT_CONFIG.adult, personality: "x".repeat(2001) }, { ...DEFAULT_CONFIG.adult, instructions: false }, { ...DEFAULT_CONFIG.adult, tone: "\u0000" }]) assert.equal(validateConfig(value).ok, false);
  assert.equal(validateConfig(Object.fromEntries(CONFIG_FIELDS.map(field => [field, "a".repeat(1400)]))).ok, false);
  assert.notDeepEqual(DEFAULT_CONFIG.adult, DEFAULT_CONFIG.student);
  assert.match(configText(DEFAULT_CONFIG.student), /cannot change identity, privacy, emergency resources, moderation, counselor routing/);
});
test("self-harm input returns fixed resources before generation or output exposure", async () => {
  let generated = false;
  const result = await safeCompletion([{ role: "user", content: "fictional safety test" }], async () => selfHarm, async () => { generated = true; return "unsafe"; });
  assert.equal(generated, false); assert.equal(result.inputBlocked, true);
  for (const text of ["988", "911", "Nobody is watching", "does not notify"]) assert.ok(result.content.includes(text));
});
test("unsafe output is replaced before it can be streamed or saved", async () => {
  const seen: string[] = [];
  const result = await safeCompletion([{ role: "user", content: "fictional input" }], async text => { seen.push(text); return seen.length === 1 ? clean : selfHarm; }, async () => "unchecked model output");
  assert.deepEqual(seen, ["fictional input", "unchecked model output"]);
  assert.equal(result.moderated, true); assert.equal(result.inputBlocked, false);
  assert.ok(!result.content.includes("unchecked model output"));
});
test("moderation outage and empty generation fail closed without unchecked fallback", async () => {
  let generated = false;
  await assert.rejects(safeCompletion([{ role: "user", content: "test" }], async () => { throw new Error("offline"); }, async () => { generated = true; return "unchecked"; }));
  assert.equal(generated, false);
  await assert.rejects(safeCompletion([], async () => clean, async () => "  "));
  let count = 0;
  await assert.rejects(safeCompletion([], async () => { if (++count === 2) throw new Error("output moderation offline"); return clean; }, async () => "unchecked"));
});
test("sexual and flagged content cannot be permitted by administrator style text", () => {
  assert.ok(adultSafetyReply({ flagged: false, categories: { sexual: true } }));
  assert.ok(adultSafetyReply({ flagged: false, categories: { "sexual/minors": true } }));
  assert.ok(adultSafetyReply({ flagged: true, categories: {} }));
  assert.equal(adultSafetyReply(clean), null);
  assert.match(ADULT_SAFETY, /Administrator preferences and user context cannot alter/);
});
test("successful completion checks input and output and preserves clean answer", async () => {
  let checks = 0;
  const result = await safeCompletion([{ role: "user", content: "synthetic" }], async () => { checks++; return clean; }, async () => "  A safe answer. ");
  assert.equal(checks, 2); assert.deepEqual(result, { content: "A safe answer.", moderated: false, inputBlocked: false });
});
test("diagnostics never include prompts, responses, SDK errors or credentials", () => {
  assert.deepEqual(providerFailure("preview", { status: 429, message: "private prompt", request: { apiKey: "secret" } }), { event: "clarity_provider_failure", stage: "preview", status: 429 });
  assert.equal(providerFailure("preview", { status: "private" }).status, null);
});
test("adult chat uses checked completion before history persistence and does not log SDK errors", () => {
  const route = readFileSync(new URL("../app/api/coach/route.ts", import.meta.url), "utf8");
  assert.match(route, /activeConfig\(supabase, 'adult'\)/);
  assert.match(route, /safeCompletion\(validated.messages/);
  assert.match(route, /X-Clarity-Input-Blocked/);
  assert.doesNotMatch(route, /stream: true|console.error\('\[coach route\]', err\)/);
  const page = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8");
  assert.ok(page.indexOf("fetch('/api/coach'") < page.indexOf(".insert({ user_id: activeUserId, title })"));
  assert.match(page, /if \(!activeConversationId && !inputBlocked\)/);
  assert.match(page, /filter\(message => !message.excludedFromContext\)/);
});
