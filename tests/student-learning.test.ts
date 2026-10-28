import assert from "node:assert/strict";
import test from "node:test";
import {
  RESET_LESSONS,
  resetPosition,
  SEL_SKILLS,
  STUDENT_TOPICS,
  BELONGING_QUESTIONS,
} from "../lib/student/learning.ts";
import {
  BELONGING_NOTICE,
  validateBelonging,
} from "../lib/student/belonging.ts";
import { studentCoachPrompt } from "../lib/student/coach.ts";
import { studentSafetyReply } from "../lib/student/safety.ts";
import {
  feelingLabel,
  isAllowedStudentDeploymentRoute,
} from "../lib/student/policy.ts";

test("every original reset lasts five minutes and maps all five CASEL areas", () => {
  assert.equal(SEL_SKILLS.length, 5);
  assert.equal(RESET_LESSONS.length, 3);
  for (const lesson of RESET_LESSONS) {
    assert.equal(
      lesson.steps.reduce((sum, step) => sum + step.seconds, 0),
      300,
    );
    assert.deepEqual(
      [...new Set(lesson.steps.map((step) => step.skill))].sort(),
      [0, 1, 2, 3, 4],
    );
    for (const step of lesson.steps) {
      assert.ok(step.title.en && step.title.es);
      assert.ok(step.instruction.en && step.instruction.es);
    }
  }
});
test("reset timing handles start, exact boundaries, background delays and completion", () => {
  const steps = RESET_LESSONS[0].steps;
  assert.deepEqual(resetPosition(0, steps), {
    index: 0,
    remaining: 60,
    done: false,
  });
  assert.deepEqual(resetPosition(59.5, steps), {
    index: 0,
    remaining: 1,
    done: false,
  });
  assert.deepEqual(resetPosition(60, steps), {
    index: 1,
    remaining: 60,
    done: false,
  });
  assert.deepEqual(resetPosition(241, steps), {
    index: 4,
    remaining: 59,
    done: false,
  });
  assert.deepEqual(resetPosition(999, steps), {
    index: 4,
    remaining: 0,
    done: true,
  });
  assert.equal(resetPosition(-20, steps).remaining, 60);
  assert.equal(resetPosition(Number.NaN, steps).remaining, 60);
});
test("all eight requested teen topics have English and Spanish draft prompts", () => {
  assert.deepEqual(
    STUDENT_TOPICS.map((t) => t.id),
    [
      "tests",
      "future",
      "social",
      "relationships",
      "identity",
      "sleep",
      "responsibilities",
      "grief",
    ],
  );
  for (const topic of STUDENT_TOPICS) {
    assert.ok(topic.label.en && topic.label.es);
    assert.ok(topic.prompt.en && topic.prompt.es);
    assert.ok(topic.prompt.en.length < 2000);
  }
});
test("belonging requires the current notice and optional bounded scores", () => {
  const valid = {
    welcome: 1,
    trusted_adult: null,
    connection: 5,
    language: "es",
    noticeVersion: BELONGING_NOTICE,
    acknowledged: true,
  };
  assert.equal(validateBelonging(valid).ok, true);
  assert.equal(BELONGING_QUESTIONS.length, 3);
  for (const extra of [
    { acknowledged: false },
    { noticeVersion: "old" },
    { welcome: 0 },
    { welcome: 6 },
    { welcome: 1.5 },
    { welcome: "1" },
    { language: "../../fake" },
    { welcome: null, trusted_adult: null, connection: null },
  ]) {
    assert.equal(
      validateBelonging({ ...valid, ...extra }).ok,
      false,
      JSON.stringify(extra),
    );
  }
});
test("Spanish coaching preserves school/privacy instructions and safe fallback boundaries", () => {
  assert.match(studentCoachPrompt("es"), /Respond in clear, natural Spanish/);
  assert.match(
    studentCoachPrompt("es"),
    /Never imply that you can monitor students/,
  );
  assert.match(studentCoachPrompt("en"), /Respond in clear English/);
  assert.match(
    studentSafetyReply(
      { flagged: true, categories: { "self-harm/intent": true } },
      "es",
    )!,
    /no avisa a tu consejero/,
  );
  assert.match(
    studentSafetyReply(
      { flagged: true, categories: { "sexual/minors": true } },
      "es",
    )!,
    /persona adulta/,
  );
  assert.equal(
    studentSafetyReply({ flagged: false, categories: {} }, "es"),
    null,
  );
  assert.equal(feelingLabel(8, "es"), "Me siento bien");
  assert.equal(isAllowedStudentDeploymentRoute("/student/class-reset"), true);
});
