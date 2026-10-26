import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  shiftDay,
  weekStart,
  validateGoal,
  pageOffset,
  validId,
} from "../lib/student/features.ts";
const draft = {
  week: "2026-10-25",
  title: "Plan my school week",
  category: "School",
  notes: "Start small",
  deadline: "2026-10-30",
};
test("student weeks and date navigation stay on local calendar dates", () => {
  assert.equal(weekStart("2026-10-26"), "2026-10-25");
  assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(dateKey(new Date(2026, 9, 26, 23, 59)), "2026-10-26");
});
test("student goals accept dates or week-long commitments without writable completion fields", () => {
  const result = validateGoal({
    ...draft,
    is_complete: false,
    progress: 0,
    user_id: "forged",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.goal.day, "2026-10-30");
    assert.equal("is_complete" in result.goal, false);
    assert.equal("user_id" in result.goal, false);
  }
  const weekly = validateGoal({ ...draft, deadline: "" });
  assert.equal(weekly.ok, true);
  if (weekly.ok) {
    assert.equal(weekly.goal.deadline, null);
    assert.equal(weekly.goal.day, "2026-10-25");
  }
});
test("student goal validation rejects malformed weeks, cross-week deadlines, categories and oversized data", () => {
  for (const change of [
    { week: "2026-10-26" },
    { week: "2026-02-30" },
    { deadline: "2026-11-02" },
    { deadline: "javascript:alert(1)" },
    { category: "Deliverable" },
    { title: " " },
    { title: "x".repeat(161) },
    { notes: "x".repeat(1601) },
  ])
    assert.equal(validateGoal({ ...draft, ...change }).ok, false);
});
test("history pages and record identifiers are bounded and reject query injection", () => {
  assert.equal(pageOffset(null), 0);
  assert.equal(pageOffset("100"), 100);
  for (const v of ["-1", "1.5", "NaN", "100001", "0&user=other"])
    assert.equal(pageOffset(v), null);
  assert.equal(validId("10000000-0000-4000-8000-000000000001"), true);
  assert.equal(validId("id.or.user_id.eq.other"), false);
});
