"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StudentSafety } from "@/components/student/StudentShell";
import StudentBrand from "@/components/student/StudentBrand";
import {
  StudentLanguageProvider,
  StudentLanguageSwitch,
  useStudentLanguage,
} from "@/components/student/StudentLanguage";

export default function StudentSignIn() {
  return (
    <StudentLanguageProvider>
      <SignInForm />
    </StudentLanguageProvider>
  );
}
function SignInForm() {
  const { language, t } = useStudentLanguage();
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
          t(
            "We could not sign you in. Check your school invitation and sign-in details.",
            "No pudimos iniciar tu sesión. Revisa tu invitación escolar y tus datos de acceso.",
          ),
        );
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(
        next === "/student/admin/notifications" ? next : "/student",
      );
    } catch {
      setError(
        t(
          "Student sign-in is temporarily unavailable. Please try again later.",
          "El acceso estudiantil no está disponible por ahora. Inténtalo más tarde.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="student-wrap" lang={language}>
      <header className="student-header">
        <Link className="student-brand" href="/student">
          <StudentBrand />
        </Link>
        <StudentLanguageSwitch />
      </header>
      <main className="student-main student-narrow">
        <div className="student-intro">
          <h1>{t("A little space for you.", "Un pequeño espacio para ti.")}</h1>
          <p>
            {t(
              "Sign in with the account from your student pilot invitation.",
              "Inicia sesión con la cuenta de tu invitación al piloto estudiantil.",
            )}
          </p>
        </div>
        <div className="student-card">
          <form className="student-form" onSubmit={signIn}>
            <label>
              {t("Email", "Correo electrónico")}
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
              {t("Password", "Contraseña")}
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
              {busy
                ? t("Signing in…", "Iniciando sesión…")
                : t("Sign in", "Iniciar sesión")}
            </button>
            <p>
              {t(
                "This pilot is invitation-only. Need help with your account? Ask your school or pilot coordinator.",
                "Solo puedes entrar con una invitación. ¿Necesitas ayuda con tu cuenta? Consulta con tu escuela o con quien coordina el piloto.",
              )}
            </p>
          </form>
        </div>
        <div className="student-privacy-links">
          <a
            href="https://amazegen.com/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Privacy policy", "Política de privacidad")}
          </a>
          <a
            href="https://amazegen.com/terms.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Terms of use", "Términos de uso")}
          </a>
        </div>
        <StudentSafety />
      </main>
    </div>
  );
}
