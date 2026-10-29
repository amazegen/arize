import test from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_MONTHS, rangeBounds, schoolChartPreview } from "../lib/student/chart-preview.ts";
test("range charts preserve reported bounds rather than substituting exact midpoints", () => {
  assert.deepEqual(rangeBounds("20–29"), [20, 29]);
  for (const value of [null, "", "29–20", "20-29", "20.5–29", "NaN", "999999999999999999999–999999999999999999999"]) assert.equal(rangeBounds(value), null);
});
test("preview period controls stay within the three fictional completed months", () => {
  assert.equal(schoolChartPreview(-10).period, PREVIEW_MONTHS[0]);
  assert.equal(schoolChartPreview(100).period, PREVIEW_MONTHS[2]);
  assert.equal(schoolChartPreview(NaN).period, PREVIEW_MONTHS[2]);
  assert.equal(schoolChartPreview(1).resets.reduce((sum, r) => sum + r.value, 0), 13);
});
test("missing sample values remain null, topic categories are not dropped, and month controls change rows", () => {
  assert.equal(schoolChartPreview(2).participation[1].range, null);
  assert.equal(schoolChartPreview(2).topics.length, 8);
  assert.notDeepEqual(schoolChartPreview(0).participation, schoolChartPreview(2).participation);
  for (const p of [0, 1, 2]) {
    const data = schoolChartPreview(p);
    for (const r of [...data.participation, ...data.topics, ...data.belonging, ...data.ambassadors]) {
      const bounds = rangeBounds(r.range);
      if (bounds) assert.ok(bounds[0] >= 10 && bounds[1] < 40);
    }
  }
});
