// Explicit release-only SMTP smoke check. Uses Resend's delivery simulator,
// never a student's or staff member's inbox. Credentials stay on Vercel.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

async function run() {
  if (process.env.ARIZE_STUDENT_SIGNUP_CHECK !== "synthetic-only") return;
  assert.equal(process.env.VERCEL_PROJECT_ID, "prj_xFxdpxs5BR6RRcFLdZiok6h0Lqvi");
  assert.equal(process.env.ARIZE_EDITION, "student");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(url, "https://kqwlqdsyocawljofrsvt.supabase.co");
  const auth = { persistSession: false, autoRefreshToken: false };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth });
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth });
  const marker = randomUUID();
  const email = "delivered@resend.dev";
  // Only run this initial mail check before real accounts are onboarded.
  const before = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  assert.ok(!before.error && before.data.users.length === 0, "SMTP smoke check requires an empty pilot Auth directory");
  let id;
  try {
    const result = await client.auth.signUp({
      email,
      password: randomBytes(32).toString("base64url"),
      options: {
        data: { arize_signup_check: marker },
        emailRedirectTo: "https://students.arizeapp.com/auth/callback?next=%2Fstudent%2Fstaff",
      },
    });
    if (result.error) throw new Error("Signup confirmation request failed");
    id = result.data.user?.id;
    assert.ok(id, "Signup returned no account");
    assert.equal(result.data.session, null, "Unconfirmed signup must not receive a session");
    const saved = await admin.auth.admin.getUserById(id);
    assert.ok(!saved.error && saved.data.user);
    assert.equal(saved.data.user.email, email);
    assert.equal(saved.data.user.user_metadata.arize_signup_check, marker);
    assert.ok(!saved.data.user.email_confirmed_at, "Confirmation must remain required");
    console.log("[student-signup-check] PASS signup confirmation accepted; email remains unconfirmed with no session");
  } finally {
    if (id) {
      const saved = await admin.auth.admin.getUserById(id);
      assert.ok(!saved.error && saved.data.user?.email === email && saved.data.user?.user_metadata.arize_signup_check === marker, "Refusing cleanup of an unrelated account");
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error) throw new Error("Synthetic signup cleanup failed");
      console.log("[student-signup-check] PASS temporary simulator account removed");
    }
  }
}
run().catch(() => {
  console.error("[student-signup-check] FAILED signup/SMTP smoke check (provider details omitted)");
  process.exitCode = 1;
});
