import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_STUDENT_VIEW, studentPreviewScreen, studentWorkspacePath } from "../lib/student/student-preview.ts";

test("admin preview allows only student screens", () => {
  for (const screen of ["home", "goals", "clarity", "profile", "class-reset"]) assert.equal(studentPreviewScreen(screen), screen);
  for (const screen of ["staff-school", "operator", "https://evil.example", ["clarity"], null]) assert.equal(studentPreviewScreen(screen), "home");
});

test("preview navigation cannot redirect live students or leave the admin sandbox", () => {
  assert.equal(studentWorkspacePath(true, true), ADMIN_STUDENT_VIEW);
  assert.equal(studentWorkspacePath(true, false), "/student-design");
  assert.equal(studentWorkspacePath(false, true), "/student");
  assert.equal(studentWorkspacePath(false, false), "/student");
});
