import test from "node:test";
import assert from "node:assert/strict";
import { studentErrorText } from "../lib/student/error-language.ts";
test("Spanish errors preserve saved-message and safety semantics without displaying unknown backend detail", () => {
 assert.match(studentErrorText("Your message was saved, but Clarity is unavailable.","es"), /se guardó.*historial/);
 assert.match(studentErrorText("Student safety checks are unavailable. No message was saved.","es"), /No se guardó/);
 assert.equal(studentErrorText("Tu mensaje está guardado.","es"), "Tu mensaje está guardado.");
 assert.doesNotMatch(studentErrorText("unknown English backend detail", "es"), /backend/);
});
