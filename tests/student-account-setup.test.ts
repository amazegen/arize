import test from "node:test";
import assert from "node:assert/strict";
import { validSetupToken, passwordSetupError } from "../lib/student/account-setup.ts";

test("account setup accepts only bounded invite and recovery tokens", () => {
  for (const type of ["invite", "recovery"]) assert.equal(validSetupToken("a".repeat(64), type), true);
  for (const type of ["signup", "email_change", "admin", null]) assert.equal(validSetupToken("a".repeat(64), type), false);
  for (const token of [null, "", "abc", "a".repeat(257), "<script>".repeat(10)]) assert.equal(validSetupToken(token, "invite"), false);
});
test("password setup requires a matching long password", () => {
  assert.equal(passwordSetupError("unique passphrase here", "unique passphrase here"), null);
  assert.ok(passwordSetupError("short", "short"));
  assert.ok(passwordSetupError("a".repeat(129), "a".repeat(129)));
  assert.ok(passwordSetupError("unique passphrase here", "different passphrase"));
});
