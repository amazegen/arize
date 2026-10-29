"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { passwordSetupError, validSetupToken } from "@/lib/student/account-setup";
import StudentBrand from "@/components/student/StudentBrand";

export default function AccountSetupPage() {
  const [phase, setPhase] = useState<"loading" | "verify" | "password" | "recover" | "done">("loading");
  const [token, setToken] = useState<{ token_hash: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token_hash = fragment.get("token_hash");
    const type = fragment.get("type");
    async function initialize() {
      const result = await createClient().auth.getUser();
      if (!active) return;
      if (validSetupToken(token_hash, type)) {
        setToken({ token_hash: token_hash!, type: type! }); setPhase("verify");
      } else setPhase(result.data.user ? "password" : "recover");
    }
    initialize().catch(() => { if (active) setPhase("recover"); });
    return () => { active = false; };
  }, []);

  async function verify() {
    setBusy(true); setError("");
    // Fragments never reach server logs; remove it before making the verification request.
    window.history.replaceState(null, "", window.location.pathname);
    try {
      const response = await fetch("/api/student/auth/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token) });
      const result = await response.json();
      setToken(null);
      if (!response.ok) { setPhase("recover"); throw new Error(result.error); }
      setPhase("password");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not verify your link. Please try again."); }
    finally { setBusy(false); }
  }
  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    try {
      const problem = passwordSetupError(password, String(form.get("confirmation") ?? ""));
      if (problem) throw new Error(problem);
      const client = createClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) { setPhase("recover"); throw new Error("Your setup session expired. Request a new email below."); }
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw new Error("We could not save that password. Try a different strong password or request a new setup email.");
      await client.auth.signOut({ scope: "local" });
      setPhase("done");
      window.location.replace("/student/sign-in?next=%2Fstudent%2Fstaff&setup=complete");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your password. Please try again."); }
    finally { setBusy(false); }
  }
  async function requestEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const { error: sendError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback` });
      if (sendError) throw new Error("We could not send a setup email right now. Please wait a moment and try again.");
      setMessage("If an account exists for that email, you’ll receive an Arize password setup email. Check your inbox and spam folder, then open the newest link.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not request your email. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="student-wrap student-auth-wrap">
    <header className="student-header"><Link className="student-brand" href="/student/staff"><StudentBrand /></Link></header>
    <main className="student-main student-narrow">
      <div className="student-intro"><p className="staff-eyebrow">ACCOUNT SETUP</p><h1>{phase === "recover" ? "Let’s get you signed in." : "Welcome to Arize."}</h1><p>Verify your email, choose your password, then sign in to your assigned workspace.</p></div>
      <section className="student-card" aria-busy={busy}>
        {error && <p role="alert" className="student-error">{error}</p>}
        {message && <p role="status" className="student-success">{message}</p>}
        {phase === "loading" && <p role="status">Checking your setup link…</p>}
        {phase === "verify" && <><h2>Step 1: Verify your email</h2><p>This secure, one-time link lets you set your own password. Arize will never ask you to email your password.</p><button className="student-action" disabled={busy} onClick={verify}>{busy ? "Verifying…" : "Continue to create password"}</button></>}
        {phase === "password" && <form className="student-form" onSubmit={savePassword}><h2>Step 2: Create your password</h2><p>Use 12–128 characters. A unique passphrase is a good choice.</p><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label>Confirm password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><button className="student-action" disabled={busy}>{busy ? "Saving…" : "Save password and go to sign-in"}</button></form>}
        {phase === "recover" && <form className="student-form" onSubmit={requestEmail}><h2>Get a new password setup link</h2><p>Already opened your invitation, or the link expired? Enter your invited work email. Creating a password does not change your assigned permissions.</p><label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label><button className="student-action" disabled={busy}>{busy ? "Sending…" : "Send password setup email"}</button></form>}
        {phase === "done" && <p role="status">Password saved. Taking you to sign-in…</p>}
      </section>
      <p><Link href="/student/sign-in?next=%2Fstudent%2Fstaff">Already have a password? Staff sign-in</Link></p>
      <p>Your assigned role controls your workspace. A setup link never grants administrator access by itself.</p>
    </main>
  </div>;
}
