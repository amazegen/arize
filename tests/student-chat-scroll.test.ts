import test from "node:test";
import assert from "node:assert/strict";
import { chatFollowAction, chatViewportBottom, isNearChatEnd } from "../lib/student/chat-scroll.ts";

test("chat follows near the end, including fractional pixels and short threads", () => {
  assert.equal(isNearChatEnd(0.5), true);
  assert.equal(isNearChatEnd(-40), true);
  assert.equal(isNearChatEnd(96), true);
  assert.equal(isNearChatEnd(97), false);
  assert.equal(isNearChatEnd(NaN), false);
});
test("sending resumes following but a reader of older messages is not pulled down", () => {
  assert.equal(chatFollowAction(true, false), "follow");
  assert.equal(chatFollowAction(false, true), "follow");
  assert.equal(chatFollowAction(false, false), "preserve");
});
test("student message visibility reserves space for composer and phone navigation", () => {
  assert.equal(chatViewportBottom(844, 160, 84), 584);
  assert.equal(chatViewportBottom(844, 160, 0), 668);
  assert.equal(chatViewportBottom(200, 240, 80), 0);
});
