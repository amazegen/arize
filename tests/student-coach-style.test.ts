import assert from "node:assert/strict";
import test from "node:test";
import { studentCoachPrompt, studentWritingExamples, STUDENT_COACH_PROMPT_VERSION } from "../lib/student/coach.ts";
import { studentSafetyReply } from "../lib/student/safety.ts";

test("coaching style is versioned, brief and does not impersonate Shelby", () => {
  assert.equal(STUDENT_COACH_PROMPT_VERSION, "student-clarity-2026-10-29-v4");
  for (const language of ["en", "es"] as const) {
    const prompt = studentCoachPrompt(language);
    for (const instruction of ["40–100 words", "one manageable next step", "Never claim to be Shelby", "respect that choice", "Safety guidance takes priority", "Never diagnose", "Do not claim confidentiality"])
      assert.ok(prompt.includes(instruction), instruction);
  }
});

test("writing reference controls phrasing and cadence without presenting notes as exact speech", () => {
  for (const language of ["en", "es"] as const) {
    const prompt = studentCoachPrompt(language);
    for (const instruction of ["measured, direct, reflective writing", "two to four connected sentences", "Do not repeat the same opening", "not verified quotations from Shelby", "not about \"the client\""])
      assert.ok(prompt.includes(instruction), instruction);
    assert.ok(prompt.includes(studentWritingExamples(language)));
  }
  assert.match(studentWritingExamples("en"), /Original fictional examples/);
  assert.match(studentWritingExamples("es"), /Una nota muestra/);
  assert.doesNotMatch(studentWritingExamples("es"), /One quiz shows/);
});

test("summary-derived approach preserves student agency and excludes adult clinical advice", () => {
  for (const language of ["en", "es"] as const) {
    const prompt = studentCoachPrompt(language);
    for (const instruction of ["Validate before gently challenging", "their identity", "one short, respectful sentence", "Progress", "their worth", "Do not import adult session advice", "Never suggest that a student's abuse"])
      assert.ok(prompt.toLowerCase().includes(instruction.toLowerCase()), instruction);
    assert.ok(prompt.includes("not a person, counselor, therapist"));
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
