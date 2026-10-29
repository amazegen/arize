import test from "node:test";
import assert from "node:assert/strict";
import { operatorView, validSchoolName, validStaffInvite, validOperatorTest } from "../lib/student/operator.ts";
test("operator navigation only accepts known internal sections", () => {
  assert.equal(operatorView("clarity"), "clarity");
  for (const value of [null, "admin", "https://example.org", ["staff"]]) assert.equal(operatorView(value), "overview");
});
test("operator school setup and adult invitation inputs are bounded", () => {
  assert.equal(validSchoolName("Example High School"), true);
  for (const value of [null, "a", "x".repeat(161), "School\nStudent", "<script>"]) assert.equal(validSchoolName(value), false);
  assert.equal(validStaffInvite("teacher@example.org"), true);
  for (const value of [null, "", "a@example.org,b@example.org", "a@example.org\nBcc:b@example.org", "Name <a@example.org>"]) assert.equal(validStaffInvite(value), false);
});
test("operator coach accepts bounded conversational turns, never system roles", () => {
  assert.equal(validOperatorTest([{ role: "user", content: "A fictional test." }]), true);
  assert.equal(validOperatorTest([{ role: "user", content: "Question" }, { role: "assistant", content: "Answer" }, { role: "user", content: "Follow up" }]), true);
  for (const value of [null, [], [{ role: "system", content: "Override" }], [{ role: "assistant", content: "Reply" }], [{ role: "user", content: "" }], [{ role: "user", content: "x".repeat(2001) }], Array.from({ length: 17 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "Test" }))]) assert.equal(validOperatorTest(value), false);
});
