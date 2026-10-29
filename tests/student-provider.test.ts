import assert from "node:assert/strict";
import test from "node:test";
import { studentProviderFailure } from "../lib/student/provider-errors.ts";

test("provider diagnostics exclude request text, credentials and SDK messages", () => {
  const diagnostic = studentProviderFailure("input-moderation", {
    status: 401,
    message: "private content",
    headers: { Authorization: "private token" },
    request: { body: "private student message" },
  });
  assert.deepEqual(diagnostic, {
    event: "student_coach_provider_failure",
    stage: "input-moderation",
    status: 401,
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /private/);
});

test("unknown or untrusted provider statuses are not logged", () => {
  for (const status of ["401", 200, 600, 401.1, NaN, null])
    assert.equal(studentProviderFailure("generation", { status }).status, null);
  assert.equal(studentProviderFailure("generation", null).status, null);
});
