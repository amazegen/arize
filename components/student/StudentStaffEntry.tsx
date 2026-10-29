"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import StudentBrand from "./StudentBrand";
import StaffSignOut from "./StaffSignOut";
import { REQUESTABLE_STAFF_ROLES, type OperationsState } from "@/lib/student/operations";
const roleNames = { therapist: "Therapist / counselor", teacher: "Teacher", school_staff: "School administrator" };
export default function StudentStaffEntry({ initial, error: setupError, preview = false, signupReady = false }: { initial: OperationsState | null; error?: string; preview?: boolean; signupReady?: boolean }) {
  const [state, setState] = useState(initial);
  const [create, setCreate] = useState(true);
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
        const email = String(form.get("email")); const password = String(form.get("password"));
        const result = create ? await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fstudent%2Fstaff` } }) : await client.auth.signInWithPassword({ email, password });
        if (result.error) throw new Error("Could not complete sign-in. Check your details, email confirmation and the account password requirements.");
        if (!result.data.session) { setMessage("Check your email to confirm the account, then return here to complete your staff profile. Existing accounts can use Sign in."); return; }
      } else {
        const response = await fetch("/api/student/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", name: form.get("name"), school: form.get("school"), role: form.get("role"), acknowledged: form.get("acknowledged") === "on" }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not submit the request.");
        setMessage("Your profile was saved. Access stays pending until your identity and school authority are verified.");
      }
      const response = await fetch("/api/student/operations", { cache: "no-store" });
      if (!response.ok) throw new Error("Please reload to check your account status.");
      const body = await response.json(); setState(body.state);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not continue."); }
    finally { setBusy(false); }
  }
  return <div className="student-wrap student-auth-wrap"><header className="student-header"><Link className="student-brand" href={preview ? "/student-design?screen=home" : "/student/staff"}><StudentBrand /></Link>{state&&!preview&&<StaffSignOut />}</header><main className="student-main student-narrow">
    <div className="student-intro"><p className="staff-eyebrow">STAFF ONBOARDING</p><h1>A workspace for your role.</h1><p>Teachers, counselors and school administrators use separate views. Creating an account never grants access to student information.</p></div>
    {preview && <p className="staff-preview-note">Local onboarding review. No accounts are created here.</p>}
    {error && <p role="alert" className="student-error">{error}</p>}{message && <p role="status" className="student-success">{message}</p>}
    {state?.application?.status === "pending" ? <section className="student-card"><h2>Your access request is pending.</h2><p>{state.application.display_name} · {roleNames[state.application.requested_role]} · {state.application.school_name}</p><p>A verified pilot operator will review your school and role. No student records are available during review.</p><button className="student-secondary" onClick={() => window.location.reload()}>Check approval status</button></section> : <section className="student-card"><form className="student-form" onSubmit={submit}>
      {!state ? <><h2>{create ? "Create your staff account" : "Staff sign-in"}</h2>{create&&!signupReady&&!preview&&<p role="status">New staff registration is awaiting production email setup. Existing approved staff can sign in below.</p>}<label>Work email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label><label>Password<input name="password" type="password" minLength={create?12:undefined} maxLength={128} autoComplete={create ? "new-password" : "current-password"} required /></label><p>After confirming your email, you’ll enter your role, preferred name and school. Your role must be approved before access is enabled.</p><button className="student-action" disabled={busy||(create&&!signupReady&&!preview)}>{busy ? "Working…" : create ? "Create account" : "Sign in"}</button><button type="button" className="student-secondary" onClick={() => setCreate((v) => !v)}>{create ? "Already have an account? Sign in" : "Create a new staff account"}</button></> : <><h2>Tell us about your role</h2><label>Your preferred name<input name="name" maxLength={80} defaultValue={state.application?.display_name} required /></label><label>School / organization<input name="school" maxLength={160} defaultValue={state.application?.school_name} required /></label><label>Your role<select name="role" defaultValue={state.application?.requested_role ?? "teacher"}>{REQUESTABLE_STAFF_ROLES.map((role) => <option key={role} value={role}>{roleNames[role]}</option>)}</select></label><p>Teacher: your classes, attendance totals and Class Reset logs. Counselor: student-requested contact and notification settings. School administrator: approved program reports and program totals.</p><label className="student-check"><input name="acknowledged" type="checkbox" required />I’m requesting an authorized school role. I understand access requires verification and I must not enter student names into class labels or aggregate reporting forms.</label><button className="student-action" disabled={busy}>{busy ? "Submitting…" : "Request access"}</button></>}
    </form></section>}
    {!state && <p><Link href="/student/account-setup">Invited or forgot your password? Set up your password.</Link></p>}
    <div className="student-privacy-links"><a href="https://amazegen.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a><a href="https://amazegen.com/terms.html" target="_blank" rel="noopener noreferrer">Terms</a></div>
  </main></div>;
}
