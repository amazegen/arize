"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StudentSafety } from "@/components/student/StudentShell";
import StudentBrand from "@/components/student/StudentBrand";

export default function StudentSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error } = await createClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(
          "We could not sign you in. Check your school invitation and sign-in details.",
        );
        return;
      }
      window.location.assign("/student");
    } catch {
      setError(
        "Student sign-in is temporarily unavailable. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="student-wrap">
      <header className="student-header">
        <Link className="student-brand" href="/student">
          <StudentBrand />
        </Link>
      </header>
      <main className="student-main student-narrow">
        <div className="student-intro">
          <h1>A little space for you.</h1>
          <p>Sign in with the account from your student pilot invitation.</p>
        </div>
        <div className="student-card">
          <form className="student-form" onSubmit={signIn}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={128}
              />
            </label>
            {error ? (
              <p role="alert" className="student-error">
                {error}
              </p>
            ) : null}
            <button className="student-action" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p>
              This pilot is invitation-only. Need help with your account? Ask
              your school or pilot coordinator.
            </p>
          </form>
        </div>
        <div className="student-privacy-links">
          <a
            href="https://amazegen.com/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy policy
          </a>
          <a
            href="https://amazegen.com/terms.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of use
          </a>
        </div>
        <StudentSafety />
      </main>
    </div>
  );
}
