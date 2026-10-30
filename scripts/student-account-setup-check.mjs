// Explicit synthetic-only auth acceptance. No real passwords, emails or roles are changed.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { staffSignupOutcome } from "../lib/student/staff-auth.ts";
let stage = "disabled";
async function run() {
  if (process.env.ARIZE_STUDENT_ACCOUNT_CHECK !== "synthetic-only") return;
  assert.equal(process.env.VERCEL_PROJECT_ID, "prj_xFxdpxs5BR6RRcFLdZiok6h0Lqvi");
  assert.equal(process.env.ARIZE_EDITION, "student");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(url, "https://kqwlqdsyocawljofrsvt.supabase.co");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const marker = randomUUID();
  const email = `arize-account-check-${marker}@example.org`;
  const base = "http://localhost:3196";
  let id; let server;
  try {
    stage = "invite-generation";
    const invite = await admin.auth.admin.generateLink({ type: "invite", email });
    assert.ok(!invite.error && invite.data.user && invite.data.properties?.hashed_token);
    id = invite.data.user.id;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3196"], { stdio: "ignore", env: process.env });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { ready = (await fetch(base + "/student/account-setup", { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      if (server.exitCode !== null) throw new Error("Server stopped");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready);
    const token = invite.data.properties.hashed_token;
    const confirm = (body, origin = base) => fetch(base + "/api/student/auth/confirm", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
    stage = "cross-origin";
    assert.equal((await confirm({ token_hash: token, type: "invite" }, "https://untrusted.example.org")).status, 403);
    stage = "malformed-link";
    assert.equal((await confirm({ token_hash: "bad", type: "invite" })).status, 400);
    stage = "verify-invitation";
    const verified = await confirm({ token_hash: token, type: "invite" });
    assert.equal(verified.status, 200);
    const cookieJar = new Map();
    for (const line of verified.headers.getSetCookie()) {
      const pair = line.split(";")[0]; const at = pair.indexOf("=");
      cookieJar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    assert.ok(cookieJar.size);
    const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: rows => rows.forEach(({ name, value }) => cookieJar.set(name, value)),
    } });
    assert.equal((await client.auth.getUser()).data.user?.id, id);
    assert.equal((await confirm({ token_hash: token, type: "invite" })).status, 400);
    stage = "choose-password-and-sign-in";
    const password = randomBytes(32).toString("base64url");
    assert.equal((await client.auth.updateUser({ password })).error, null);
    assert.equal((await client.auth.signOut({ scope: "local" })).error, null);
    const signed = await client.auth.signInWithPassword({ email, password });
    assert.equal(signed.data.user?.id, id);
    const state = await client.rpc("student_operations_state");
    assert.equal(state.data.operator, false);
    assert.equal(state.data.role, null);
    stage = "existing-email-signup";
    const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const duplicate = await anonymous.auth.signUp({ email, password: randomBytes(32).toString("base64url") });
    assert.equal(staffSignupOutcome(duplicate), "existing");
    assert.equal((await admin.auth.admin.getUserById(id)).data.user?.id, id);
    assert.equal((await anonymous.auth.signInWithPassword({ email, password })).data.user?.id, id);
    console.log("[student-account-check] PASS existing-email signup is recognized; original account/password preserved");
    stage = "approved-staff-destination";
    const grant = await admin.from("student_operators").insert({ user_id: id, active: true });
    assert.equal(grant.error, null);
    const staff = await fetch(base + "/student/staff", { headers: { Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ") }, redirect: "manual" });
    assert.equal(staff.status, 307);
    assert.equal(new URL(staff.headers.get("location"), base).pathname, "/student/operator");
    console.log("[student-account-check] PASS authenticated project admin is redirected from staff entry to the existing dashboard");
    console.log("[student-account-check] PASS invite verification, one-time replay denial, password creation, sign-out/sign-in and no self-granted role");
    stage = "recovery";
    const recovery = await admin.auth.admin.generateLink({ type: "recovery", email });
    assert.ok(!recovery.error && recovery.data.properties?.hashed_token);
    assert.equal((await confirm({ token_hash: recovery.data.properties.hashed_token, type: "recovery" })).status, 200);
    console.log("[student-account-check] PASS recovery verification; missing/malformed links and cross-origin requests rejected");
    stage = "synthetic-mfa";
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Synthetic release-check authenticator" });
    assert.equal(enrolled.error, null);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const character of enrolled.data.totp.secret.toUpperCase().replace(/=+$/, "")) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
    const secret = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const digest = createHmac("sha1", secret).update(counter).digest(); const offset = digest[19] & 15;
    const code = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
    const checked = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code });
    assert.equal(checked.error, null);
    assert.equal((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data.currentLevel, "aal2");
    assert.equal((await client.rpc("student_operator_overview")).error, null);
    await client.auth.signOut({ scope: "local" });
    await client.auth.signInWithPassword({ email, password });
    const lower = await client.rpc("student_operator_overview");
    assert.equal(lower.error?.code, "42501");
    const guarded = await fetch(base + "/api/student/operations", { headers: { Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ") } });
    assert.equal(guarded.status, 403);
    const challengePage = await fetch(base + "/student/operator", { headers: { Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ") }, redirect: "manual" });
    assert.equal(new URL(challengePage.headers.get("location"), base).pathname, "/student/security");
    console.log("[student-account-check] PASS synthetic authenticator enrollment/verification; subsequent single-factor sign-in denied at API and database and routed to challenge");
  } finally {
    if (server) server.kill("SIGTERM");
    if (id) {
      const user = await admin.auth.admin.getUserById(id);
      assert.equal(user.data.user?.email, email, "Refusing unrelated-account cleanup");
      const removed = await admin.auth.admin.deleteUser(id);
      assert.equal(removed.error, null);
      console.log("[student-account-check] PASS synthetic auth fixture cleaned up; no real email sent");
    }
  }
}
run().catch(error => { console.error(`[student-account-check] FAILED ${stage} expected=${typeof error.expected === "number" ? error.expected : "unknown"} actual=${typeof error.actual === "number" ? error.actual : "unknown"} (credentials and tokens omitted)`); process.exitCode = 1; });
