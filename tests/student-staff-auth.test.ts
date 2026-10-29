import test from "node:test";
import assert from "node:assert/strict";
import { staffSignupOutcome } from "../lib/student/staff-auth.ts";
test("staff signup recognizes explicit and obfuscated existing-account responses", () => {
  for (const code of ["user_already_exists", "email_exists"]) assert.equal(staffSignupOutcome({ error: { code }, data: {} }), "existing");
  assert.equal(staffSignupOutcome({ error: null, data: { session: null, user: { identities: [] } } }), "existing");
});
test("unconfirmed signup is not reported as authenticated or as a new-role grant", () => {
  assert.equal(staffSignupOutcome({ error: null, data: { session: null, user: { identities: [{}] } } }), "confirmation");
  assert.equal(staffSignupOutcome({ error: null, data: { session: {} } }), "signed-in");
  assert.equal(staffSignupOutcome({ error: { code: "weak_password" }, data: {} }), "error");
  assert.equal(staffSignupOutcome({ error: { code: "over_email_send_rate_limit" }, data: {} }), "error");
});
