"use client";
/* eslint-disable @next/next/no-img-element -- Private Supabase Auth QR must stay inline, not pass through an image optimizer. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import StudentBrand from "./StudentBrand";
import StaffSignOut from "./StaffSignOut";

export default function AccountSecurity() {
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([createClient().auth.mfa.listFactors(), createClient().auth.mfa.getAuthenticatorAssuranceLevel()]).then(([factors, assurance]) => {
      if (!active) return;
      if (factors.error || assurance.error) { setError("Account security is unavailable. Refresh to try again."); return; }
      const factor = factors.data.totp.find((f: { id: string; status: string }) => f.status === "verified");
      const unfinished = factors.data.all.find((f: { id: string; status: string; friendly_name?: string }) => f.status === "unverified" && f.friendly_name?.startsWith("Arize authenticator "));
      setEnabled(Boolean(factor)); setFactorId(factor?.id ?? unfinished?.id ?? ""); setVerified(assurance.data.currentLevel === "aal2");
    }).catch(() => { if (active) setError("Account security could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function enroll() {
    setBusy(true); setError("");
    try {
      const result = await createClient().auth.mfa.enroll({ factorType: "totp", issuer: "Arize Student Edition", friendlyName: `Arize authenticator ${new Date().toISOString()}` });
      if (result.error) throw new Error("Could not start authenticator setup. Refresh and try again.");
      setFactorId(result.data.id); setQr(result.data.totp.qr_code);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Setup unavailable."); } finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw new Error("That code could not be verified. Use the latest six-digit code from your authenticator.");
      setQr(""); setCode(""); setEnabled(true); setVerified(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Verification unavailable."); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try {
      const result = await createClient().auth.mfa.unenroll({ factorId });
      if (result.error) throw new Error("Could not cancel unfinished setup. Refresh before trying again.");
      setFactorId(""); setQr(""); setCode("");
    } catch { setError("Could not cancel unfinished setup. Refresh before trying again."); } finally { setBusy(false); }
  }
  return <div className="student-wrap student-auth-wrap"><header className="student-header"><Link className="student-brand" href="/student/staff"><StudentBrand /></Link><StaffSignOut /></header><main className="student-main student-narrow"><div className="student-intro"><p className="staff-eyebrow">ACCOUNT SECURITY</p><h1>Protect your workspace.</h1><p>Use an authenticator app for a second sign-in check. Never share your setup QR or verification code.</p></div><section className="student-card" aria-busy={busy || loading}>
    {error && <p className="student-error" role="alert">{error}</p>}
    {!loading && !enabled && factorId && !qr && <p>You have an unfinished authenticator setup. If you no longer have its QR or authenticator entry, cancel unfinished setup below, then start again.</p>}
    {loading ? <p role="status">Checking account security…</p> : verified ? <><h2>Authenticator verified</h2><p role="status">This session has completed the second sign-in check.</p><Link className="student-action" href="/student/staff">Continue to your workspace</Link></> : factorId ? <form className="student-form" onSubmit={verify}><h2>{enabled ? "Verify your sign-in" : "Finish authenticator setup"}</h2>{qr && <>{/* QR is provided directly by Supabase Auth, never an external image service. */}<img className="account-security-qr" src={qr} alt="Scan this private setup QR with your authenticator app" width={220} height={220} /><p>Scan the QR, keep the authenticator entry, then enter its current code. After verification, future staff sessions require this check. Contact your project owner if you lose your device; no recovery bypass is provided here.</p></>}<label>Six-digit authenticator code<input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0,6))} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required /></label><button className="student-action" disabled={busy}>{busy ? "Verifying…" : enabled ? "Verify sign-in" : "Enable authenticator"}</button>{!enabled && <button type="button" className="student-secondary" disabled={busy} onClick={cancel}>Cancel unfinished setup</button>}</form> : <><h2>Add a second sign-in check</h2><p>Setup is optional during the rollout. Start only when you have your authenticator app ready. It becomes required for your staff sessions once you verify it.</p><button className="student-action" disabled={busy || Boolean(error)} onClick={enroll}>Set up authenticator</button></>}
    </section><p><Link href="/student/staff">Back to your workspace</Link></p></main></div>;
}
