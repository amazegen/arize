import test from "node:test";
import assert from "node:assert/strict";
import { operatorTestBlock, requestOperatorTest } from "../lib/student/operator-test-client.ts";
const ready = { busy: false, enabled: true, exhausted: false, fictional: true, content: "Fictional test" };
const payload = { messages: [{ role: "user" as const, content: "Fictional test" }], language: "en", fictional: true };
test("operator send state explains the checkbox gate rather than pretending to load", () => {
  assert.equal(operatorTestBlock(ready), null);
  assert.match(operatorTestBlock({ ...ready, fictional: false })!, /Check the fictional/);
  assert.match(operatorTestBlock({ ...ready, busy: true })!, /Sending/);
  assert.match(operatorTestBlock({ ...ready, content: " " })!, /Write/);
  assert.match(operatorTestBlock({ ...ready, exhausted: true })!, /New test/);
  assert.match(operatorTestBlock({ ...ready, enabled: false })!, /not enabled/);
});
test("operator test returns a validated reply and propagates safe API errors", async () => {
  const success = (async () => Response.json({ content: "A fictional reply." })) as typeof fetch;
  assert.equal(await requestOperatorTest(payload, { fetcher: success }), "A fictional reply.");
  const failure = (async () => Response.json({ error: "Project administrator access required." }, { status: 403 })) as typeof fetch;
  await assert.rejects(requestOperatorTest(payload, { fetcher: failure }), /administrator access/);
  const invalid = (async () => Response.json({ content: "" })) as typeof fetch;
  await assert.rejects(requestOperatorTest(payload, { fetcher: invalid }), /empty reply/);
});
test("operator test aborts stalled requests with a retryable draft-preserving message", async () => {
  const stalled = ((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  await assert.rejects(requestOperatorTest(payload, { fetcher: stalled, timeoutMs: 15 }), /took too long.*draft is still here/);
  assert.equal(payload.messages[0].content, "Fictional test");
});
test("operator test handles interrupted or non-JSON responses without a permanent loading state", async () => {
  const html = (async () => new Response("Bad gateway", { status: 502 })) as typeof fetch;
  await assert.rejects(requestOperatorTest(payload, { fetcher: html }), /connection was interrupted/);
});
