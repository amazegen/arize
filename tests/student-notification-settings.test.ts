import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationEmail,
  validateNotificationSettings,
  resolveCounselorRecipient,
} from "../lib/student/notification-settings.ts";

test("notification email must be a single bounded address, not a header or address list", () => {
  assert.equal(
    notificationEmail("  Counselor@Example.TEST "),
    "counselor@example.test",
  );
  for (const value of [
    null,
    "",
    "bad",
    "a@example.test,b@example.test",
    "a@example.test; b@example.test",
    "Name <a@example.test>",
    "a@example.test\r\nBcc: other@example.test",
    "a".repeat(255) + "@example.test",
  ])
    assert.equal(notificationEmail(value), null);
});
test("saving a destination requires matching email confirmation and authorized-recipient acknowledgement", () => {
  assert.deepEqual(
    validateNotificationSettings({
      email: "NEW@example.test",
      confirmEmail: "new@example.test",
      confirmed: true,
    }),
    { ok: true, email: "new@example.test" },
  );
  assert.equal(
    validateNotificationSettings({
      email: "new@example.test",
      confirmEmail: "other@example.test",
      confirmed: true,
    }).ok,
    false,
  );
  assert.equal(
    validateNotificationSettings({
      email: "new@example.test",
      confirmEmail: "new@example.test",
      confirmed: false,
    }).ok,
    false,
  );
});
test("database destination overrides deployment settings immediately", () => {
  assert.equal(
    resolveCounselorRecipient({
      databaseEmail: "updated@example.test",
      schoolId: "a",
      legacyEmail: "old@example.test",
      legacySchoolId: "a",
    }),
    "updated@example.test",
  );
  assert.equal(
    resolveCounselorRecipient({
      databaseEmail: "not-an-email",
      schoolId: "a",
      legacyEmail: "old@example.test",
      legacySchoolId: "a",
    }),
    null,
  );
});
test("initial environment fallback cannot cross school boundaries", () => {
  assert.equal(
    resolveCounselorRecipient({
      databaseEmail: null,
      schoolId: "a",
      legacyEmail: "initial@example.test",
      legacySchoolId: "a",
    }),
    "initial@example.test",
  );
  assert.equal(
    resolveCounselorRecipient({
      databaseEmail: null,
      schoolId: "b",
      legacyEmail: "initial@example.test",
      legacySchoolId: "a",
    }),
    null,
  );
});
