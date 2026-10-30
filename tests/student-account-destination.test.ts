import test from "node:test";
import assert from "node:assert/strict";
import { accountDestination } from "../lib/student/account-destination.ts";
test("verified student enrollment never routes to adult role application, even pending/revoked", () => {
  for (const status of ["active", "invited", "revoked"]) assert.equal(accountDestination({ operator: false, staffRole: null, studentStatus: status }), "/student");
});
test("verified adult roles retain their own workspaces; unknown accounts get no role", () => {
  assert.equal(accountDestination({ operator: true, staffRole: null, studentStatus: null }), "/student/operator");
  for (const role of ["therapist", "school_staff"]) assert.equal(accountDestination({ operator: false, staffRole: role, studentStatus: null }), "/student/admin");
  assert.equal(accountDestination({ operator: false, staffRole: "teacher", studentStatus: null }), "/student/teacher");
  assert.equal(accountDestination({ operator: false, staffRole: "operator", studentStatus: null }), "/student/staff");
});
