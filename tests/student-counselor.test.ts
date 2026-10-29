import assert from "node:assert/strict";
import test from "node:test";
import {
  counselorEmailText,
  deliverCounselorRequest,
} from "../lib/student/counselor-notification.ts";

const summary = {
  id: "e95ebdaf-26ab-4df2-a68d-73165de8b30c",
  displayName: "Sample Student",
  schoolName: "Sample School",
};
const config = {
  apiKey: "test-only-not-a-key",
  from: "Arize <sender@example.test>",
  to: "counselor@example.test",
};

test("counselor notification contains only the approved request summary", () => {
  const body = counselorEmailText({
    ...summary,
    rawChat: "DO_NOT_SEND",
    mood_score: 3,
  } as typeof summary);
  assert.match(body, /Sample Student/);
  assert.ok(!body.includes("Sample School"));
  assert.ok(!body.includes("DO_NOT_SEND"));
  assert.ok(!body.includes("mood_score"));
});

test("notification reports success only after provider returns an accepted ID", async () => {
  let payload: Record<string, unknown> = {};
  const fakeFetch: typeof fetch = async (_url, init) => {
    assert.equal(
      new Headers(init?.headers).get("Idempotency-Key"),
      `arize-student-counselor/${summary.id}`,
    );
    payload = JSON.parse(String(init?.body));
    return Response.json({ id: "accepted-test-message" });
  };
  assert.equal(
    await deliverCounselorRequest(config, summary, fakeFetch),
    "accepted-test-message",
  );
  assert.deepEqual(payload.to, ["counselor@example.test"]);
  assert.equal(
    payload.subject,
    "Arize: a student requested a counselor check-in",
  );
  assert.equal(payload.html, undefined);
});

test("notification rejection or missing receipt never becomes sent", async () => {
  const rejected: typeof fetch = async () =>
    Response.json({ message: "private provider detail" }, { status: 422 });
  await assert.rejects(deliverCounselorRequest(config, summary, rejected), {
    message: "Counselor notification was not accepted",
  });
  const noReceipt: typeof fetch = async () => Response.json({});
  await assert.rejects(deliverCounselorRequest(config, summary, noReceipt));
});

test("notification diagnostics expose status only, not provider detail or credentials", async () => {
  const rejected: typeof fetch = async () => Response.json(
    { message: "PRIVATE_PROVIDER_DETAIL", recipient: "PRIVATE_RECIPIENT" },
    { status: 403 },
  );
  try {
    await deliverCounselorRequest(config, summary, rejected);
    assert.fail("Rejection was reported as success");
  } catch (error) {
    assert.equal((error as { status?: number }).status, 403);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE|test-only-not-a-key/);
  }
});
