import test from "node:test";
import assert from "node:assert/strict";
import { staffDashboardDTO, validFollowup, type StaffDashboardData } from "../lib/student/staff.ts";
const fixture: StaffDashboardData = {
  role: "therapist", schoolName: "Synthetic school", hasMore: true, reportingApproved: true,
  requests: [{ id: "synthetic", display_name: "Sample student", delivery_status: "sent", created_at: "2026-10-01", stage: "new", updated_at: null }],
  reports: [{ month: "2026-09-01", published_at: "2026-10-01", report: { cohort: "40–49", checkins: "20–29", goals: null, clarity: "10–19", minimumGroup: 10, status: "published" } }],
};
test("school staff DTO never sends support requests or pagination state", () => {
  const data = staffDashboardDTO({ ...fixture, role: "school_staff" });
  assert.deepEqual(data.requests, []);
  assert.equal(data.hasMore, false);
  assert.equal(data.reports.length, 1);
});
test("therapist DTO does not disclose school reports or reporting approval", () => {
  const data = staffDashboardDTO(fixture);
  assert.deepEqual(data.reports, []);
  assert.equal(data.reportingApproved, false);
  assert.equal(data.requests.length, 1);
});
test("unapproved reports are withheld even if accidentally loaded upstream", () => {
  assert.deepEqual(staffDashboardDTO({ ...fixture, role: "school_staff", reportingApproved: false }).reports, []);
});
test("DTO whitelists fields instead of serializing private nested records", () => {
  const unsafe = { ...fixture, requests: fixture.requests.map((r) => ({ ...r, user_id: "private-id", chat: "private chat", recipient_email: "private@example.test" })), secret: "private" };
  const result = JSON.stringify(staffDashboardDTO(unsafe));
  for (const privateValue of ["private-id", "private chat", "private@example.test", "secret"]) assert.equal(result.includes(privateValue), false);
});
test("follow-up stages reject arbitrary data, clinical notes and forged states", () => {
  for (const value of ["new", "acknowledged", "contacted", "closed"]) assert.equal(validFollowup(value), true);
  for (const value of [null, undefined, {}, "high-risk", "diagnosed", "", "closed;delete"]) assert.equal(validFollowup(value), false);
});
