"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import StudentBrand from "./StudentBrand";
import StaffSignOut from "./StaffSignOut";
import { REQUESTABLE_STAFF_ROLES, staffDestination, type OperationsState } from "@/lib/student/operations";
import { staffSignupOutcome } from "@/lib/student/staff-auth";
const roleNames = { therapist: "Therapist / counselor", teacher: "Teacher", school_staff: "School administrator" };
export default function StudentStaffEntry({ initial, error: setupError, preview = false, signupReady = false }: { initial: OperationsState | null; error?: string; preview?: boolean; signupReady?: boolean }) {
  const [state, setState] = useState(initial);
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(setupError ?? "");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (preview) { setMessage("Local flow preview only. No account or access request was created."); return; }
      if (!state) {
        if (create && !signupReady) throw new Error("Staff signup is awaiting production email setup. Existing approved accounts can still sign in.");
        const client = createClient();
        const current = await client.auth.getUser();
        // A stale signed-out tab must not create another account after the user
        // has signed into this browser elsewhere. The server checks the role below.
        if (!current.data.user) {
          const address = email.trim().toLowerCase();
          const result = create ? await client.auth.signUp({ email: address, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fstudent%2Fstaff` } }) : await client.auth.signInWithPassword({ email: address, password });
          if (create) {
            const outcome = staffSignupOutcome(result);
            if (outcome === "existing") {
              setCreate(false); setPassword("");
              setMessage("An account already exists for this email. Sign in below with your existing password, or use password setup if you need a new one. Your account and permissions have not changed.");
              return;
            }
            if (outcome === "error") throw new Error("Could not register. Check the email and password requirements, or sign in if you already have an account.");
            if (outcome === "confirmation") {
              setCreate(false); setPassword("");
              setMessage("If this is a new registration, check your email to confirm it before signing in. If you already have an account, sign in below or use password setup. No new school role has been granted.");
              return;
            }
          } else if (result.error || !result.data.session) {
            throw new Error("Could not sign in. Check your email and existing password. If you were invited or forgot your password, use password setup below.");
          }
        }
      } else {
        const response = await fetch("/api/student/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", name: form.get("name"), school: form.get("school"), role: form.get("role"), acknowledged: form.get("acknowledged") === "on" }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not submit the request.");
        setMessage("Your profile was saved. Access stays pending until your identity and school authority are verified.");
      }
      const response = await fetch("/api/student/operations", { cache: "no-store" });
      if (!response.ok) throw new Error("Please reload to check your account status.");
      const body = await response.json();
      if (body.state?.operator || body.state?.role) {
        window.location.replace(staffDestination(body.state));
        return;
      }
      setState(body.state);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not continue."); }
    finally { setBusy(false); }
  }
  return <div className="student-wrap student-auth-wrap"><header className="student-header"><Link className="student-brand" href={preview ? "/student-design?screen=home" : "/student/staff"}><StudentBrand /></Link>{state&&!preview&&<StaffSignOut />}</header><main className="student-main student-narrow">
    <div className="student-intro"><p className="staff-eyebrow">STAFF ACCESS</p><h1>A workspace for your role.</h1><p>Already registered or invited? Sign in with your existing account. Your approved role takes you to the right workspace.</p></div>
    {preview && <p className="staff-preview-note">Local onboarding review. No accounts are created here.</p>}
    {error && <p role="alert" className="student-error">{error}</p>}{message && <p role="status" className="student-success">{message}</p>}
    {state?.application?.status === "pending" ? <section className="student-card"><h2>Your access request is pending.</h2><p>{state.application.display_name} · {roleNames[state.application.requested_role]} · {state.application.school_name}</p><p>A verified pilot operator will review your school and role. No student records are available during review.</p><button className="student-secondary" onClick={() => window.location.reload()}>Check approval status</button></section> : <section className="student-card"><form className="student-form" onSubmit={submit}>
      {!state ? <><h2>{create ? "Create a new staff account" : "Staff sign-in"}</h2>{create&&!signupReady&&!preview&&<p role="status">New staff registration is awaiting production email setup. Existing approved staff can sign in below.</p>}<label>Work email<input name="email" type="email" autoComplete="username" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></label><label>{create ? "Choose a password" : "Password"}<input name="password" type="password" minLength={create?12:undefined} maxLength={128} autoComplete={create ? "new-password" : "current-password"} required value={password} onChange={e => setPassword(e.target.value)} /></label><p>{create ? "Only register if you do not already have an Arize Student Edition account. Existing and invited users should sign in or use password setup. New staff must confirm their email and request a verified school role." : "Use the password you already created. You do not need another account for your administrator, counselor or teacher workspace."}</p><button className="student-action" disabled={busy||(create&&!signupReady&&!preview)}>{busy ? "Working…" : create ? "Register new account" : "Sign in"}</button><button type="button" className="student-secondary" disabled={busy} onClick={() => { setCreate(v => !v); setPassword(""); setError(""); setMessage(""); }}>{create ? "Already registered or invited? Sign in" : "First time here? Register a new staff account"}</button></> : <><h2>Tell us about your role</h2><label>Your preferred name<input name="name" maxLength={80} defaultValue={state.application?.display_name} required /></label><label>School / organization<input name="school" maxLength={160} defaultValue={state.application?.school_name} required /></label><label>Your role<select name="role" defaultValue={state.application?.requested_role ?? "teacher"}>{REQUESTABLE_STAFF_ROLES.map((role) => <option key={role} value={role}>{roleNames[role]}</option>)}</select></label><p>Teacher: your classes, attendance totals and Class Reset logs. Counselor: student-requested contact and notification settings. School administrator: approved program reports and program totals.</p><label className="student-check"><input name="acknowledged" type="checkbox" required />I’m requesting an authorized school role. I understand access requires verification and I must not enter student names into class labels or aggregate reporting forms.</label><button className="student-action" disabled={busy}>{busy ? "Submitting…" : "Request access"}</button></>}
    </form></section>}
    {!state && <p><Link href="/student/account-setup">Invited or forgot your password? Set up your password.</Link></p>}
    <div className="student-privacy-links"><a href="https://amazegen.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a><a href="https://amazegen.com/terms.html" target="_blank" rel="noopener noreferrer">Terms</a></div>
  </main></div>;
}
