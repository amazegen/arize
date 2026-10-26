import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessStudentEdition,
  isAllowedStudentDeploymentRoute,
  isStudentEdition,
  isStudentRoute,
  safeCounselorUrl,
  validDay,
  validateCheckIn,
  validateStudentProfile,
  feelingLabel,
} from "../lib/student/policy.ts";
import { STUDENT_COACH_PROMPT } from "../lib/student/coach.ts";
import { studentSafetyReply } from "../lib/student/safety.ts";

test("student safety classifier redirects high-risk content without ordinary coaching", () => {
  assert.equal(studentSafetyReply({ flagged: false, categories: {} }), null);
  assert.match(
    studentSafetyReply({
      flagged: true,
      categories: { "self-harm/intent": true },
    })!,
    /trusted adult/,
  );
  assert.match(
    studentSafetyReply({
      flagged: true,
      categories: { "sexual/minors": true },
    })!,
    /Talk to your counselor/,
  );
  assert.match(
    studentSafetyReply({ flagged: true, categories: { violence: true } })!,
    /does not notify/,
  );
});

test("student enrollment is fail-closed and requires approved consent", () => {
  assert.equal(canAccessStudentEdition(null), false);
  for (const status of ["invited", "revoked", "expired"])
    assert.equal(
      canAccessStudentEdition({
        status,
        role: "student",
        consent_verified_at: "2026-10-26",
      }),
      false,
    );
  assert.equal(
    canAccessStudentEdition({
      status: "active",
      role: "teacher",
      consent_verified_at: "2026-10-26",
    }),
    false,
  );
  assert.equal(
    canAccessStudentEdition({
      status: "active",
      role: "student",
      consent_verified_at: null,
    }),
    false,
  );
  assert.equal(
    canAccessStudentEdition({
      status: "active",
      role: "student",
      consent_verified_at: "2026-10-26",
    }),
    true,
  );
});

test("student deployment blocks adult features, billing, and prefix tricks", () => {
  for (const path of [
    "/home",
    "/village",
    "/coach",
    "/api/coach",
    "/api/billing/checkout",
    "/api/billing/portal",
    "/student-imposter",
    "/api/studentish",
    "/api/legal-consent",
  ])
    assert.equal(isAllowedStudentDeploymentRoute(path), false, path);
  for (const path of [
    "/student",
    "/student/sign-in",
    "/api/student",
    "/api/student/coach",
    "/auth/callback",
  ])
    assert.equal(isAllowedStudentDeploymentRoute(path), true, path);
  assert.equal(isStudentRoute("/students"), false);
  assert.equal(isStudentEdition("student"), true);
  assert.equal(isStudentEdition("adult"), false);
  assert.equal(isStudentEdition(""), false);
});

test("counselor handoff accepts only safe school HTTPS URLs", () => {
  for (const input of [
    null,
    "",
    "javascript:alert(1)",
    "data:text/html,test",
    "//bad.example",
    "http://school.example",
    "https://user:password@school.example",
  ])
    assert.equal(safeCounselorUrl(input), null);
  assert.equal(
    safeCounselorUrl("https://school.example/counselor"),
    "https://school.example/counselor",
  );
});

test("student inputs constrain grade, notice, date and feeling score", () => {
  assert.equal(
    validateStudentProfile({
      displayName: "Marcus",
      grade: "10",
      acknowledged: true,
    }),
    null,
  );
  assert.ok(
    validateStudentProfile({
      displayName: "",
      grade: "10",
      acknowledged: true,
    }),
  );
  assert.ok(
    validateStudentProfile({
      displayName: "Marcus",
      grade: "8",
      acknowledged: true,
    }),
  );
  assert.ok(
    validateStudentProfile({
      displayName: "Marcus",
      grade: "10",
      acknowledged: false,
    }),
  );
  assert.equal(validDay("2026-02-31"), false);
  assert.equal(validDay("2026-10-26"), true);
  assert.equal(validateCheckIn({ day: "2026-10-26", score: 7 }), null);
  for (const score of [0, 11, 1.5, "7", null])
    assert.ok(validateCheckIn({ day: "2026-10-26", score }));
  assert.equal(feelingLabel(1), "Having a hard time");
  assert.equal(feelingLabel(10), "Feeling great");
});

test("student coach uses school framing and explicit safety boundaries", () => {
  assert.ok(STUDENT_COACH_PROMPT.includes("grades 9–12"));
  assert.ok(STUDENT_COACH_PROMPT.includes("Assume the student is under 18"));
  assert.ok(STUDENT_COACH_PROMPT.includes("Never diagnose"));
  assert.ok(STUDENT_COACH_PROMPT.includes("Do not claim confidentiality"));
  assert.ok(
    STUDENT_COACH_PROMPT.includes("Never imply that you can monitor students"),
  );
  assert.ok(!STUDENT_COACH_PROMPT.includes("Black corporate professionals"));
});
