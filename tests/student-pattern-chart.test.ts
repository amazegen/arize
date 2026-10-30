import test from "node:test";
import assert from "node:assert/strict";
import { patternDayPosition } from "../lib/student/pattern-chart.ts";
test("pattern chart spaces records by calendar days, including gaps and daylight-saving boundaries", () => {
  assert.equal(patternDayPosition("2026-10-29", "2026-10-29", "2026-11-08"), 24);
  assert.equal(patternDayPosition("2026-10-30", "2026-10-29", "2026-11-08"), 79.2);
  assert.equal(patternDayPosition("2026-11-08", "2026-10-29", "2026-11-08"), 576);
  assert.equal(patternDayPosition("2026-10-29", "2026-10-29", "2026-10-29"), 24);
});
