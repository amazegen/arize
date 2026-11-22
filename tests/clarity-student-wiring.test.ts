import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studentSafetyReply } from "../lib/student/safety.ts";
import { isAllowedStudentDeploymentRoute } from "../lib/student/policy.ts";
test("student production, existing lab and draft preview retain locked safety and separate config", () => {
  for (const path of ["app/api/student/coach/route.ts", "app/api/student/operator/coach/route.ts"]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /activeConfig\(.+, "student"\)/); assert.match(source, /configText\(configuration.config\)/);
    assert.match(source, /studentSafetyReply/); assert.match(source, /omni-moderation-latest/);
    assert.doesNotMatch(source, /console\.(log|error)\(.*(?:body|content|response|history|messages|configuration)\)/);
  }
  const preview = readFileSync(new URL("../app/api/student/operator/clarity/preview/route.ts", import.meta.url), "utf8");
  assert.match(preview, /previewAPI\(request, "student", studentCoachPrompt, studentSafetyReply\)/);
  for (const language of ["en", "es"] as const) {
    const response = studentSafetyReply({ flagged: true, categories: { "self-harm": true } }, language)!;
    assert.match(response, /988/); assert.match(response, /911/);
  }
  assert.equal(isAllowedStudentDeploymentRoute("/api/admin/clarity"), false);
  assert.equal(isAllowedStudentDeploymentRoute("/admin/clarity"), false);
  assert.equal(isAllowedStudentDeploymentRoute("/student/operator/clarity"), true);
  assert.equal(isAllowedStudentDeploymentRoute("/api/billing/checkout"), false);
});
