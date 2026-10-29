import assert from "node:assert/strict";
import test from "node:test";
import { studentCoachPrompt, STUDENT_COACH_PROMPT_VERSION } from "../lib/student/coach.ts";
import { studentSafetyReply } from "../lib/student/safety.ts";

test("coaching style is versioned, brief and does not impersonate Shelby", () => {
  assert.equal(STUDENT_COACH_PROMPT_VERSION, "student-clarity-2026-10-29-v2");
  for (const language of ["en", "es"] as const) {
    const prompt = studentCoachPrompt(language);
    for (const instruction of ["40–100 words", "one manageable next step", "Never claim to be Shelby", "respect that choice", "Safety guidance takes priority", "Never diagnose", "Do not claim confidentiality"])
      assert.ok(prompt.includes(instruction), instruction);
  }
});

test("safety fallbacks stay supportive without claiming notification or live monitoring", () => {
  for (const language of ["en", "es"] as const) {
    const crisis = studentSafetyReply({ flagged: true, categories: { "self-harm/intent": true } }, language)!;
    const other = studentSafetyReply({ flagged: true, categories: { "sexual/minors": true } }, language)!;
    assert.match(crisis, /988/);
    assert.match(crisis, language === "en" ? /does not notify/ : /no avisa/);
    assert.match(other, language === "en" ? /trusted adult/ : /persona adulta/);
    assert.doesNotMatch(other, /I can’t guide you|No puedo orientarte/);
  }
});
