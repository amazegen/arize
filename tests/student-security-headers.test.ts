import test from "node:test";
import assert from "node:assert/strict";
import { studentCSP } from "../lib/student/security-headers.ts";
test("student production CSP requires trusted script nonces and limits backend connections", () => {
 const policy = studentCSP("test-nonce", "https://example.supabase.co", false);
 assert.match(policy, /script-src 'self' 'nonce-test-nonce' 'strict-dynamic';/);
 assert.doesNotMatch(policy, /unsafe-eval|ws:\/\/localhost/);
 assert.match(policy, /connect-src 'self' https:\/\/example.supabase.co wss:\/\/example.supabase.co/);
 assert.match(policy, /frame-ancestors 'none'/);
 assert.match(studentCSP("dev",undefined,true), /'unsafe-eval'/);
});
