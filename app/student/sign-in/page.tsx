"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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
      <Suspense fallback={<main className="student-main">Loading sign-in…</main>}><SignInForm /></Suspense>
    </StudentLanguageProvider>
  );
}
function SignInForm() {
  const params = useSearchParams();
  const nextPath = params.get("next");
  const staffEntry = ["/student/admin", "/student/admin/notifications", "/student/staff", "/student/teacher", "/student/operator"].includes(nextPath ?? "");
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
      const response = await fetch("/api/student/account", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const account = await response.json();
      if (!response.ok || !["/student", "/student/staff", "/student/admin", "/student/teacher", "/student/operator"].includes(account.destination)) throw new Error("access");
      window.location.assign(account.destination);
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
    <div className="student-wrap student-auth-wrap" lang={language}>
      <header className="student-header">
        <Link className="student-brand" href="/student">
          <StudentBrand />
        </Link>
        <StudentLanguageSwitch />
      </header>
      <main className="student-main student-narrow">
        <div className="student-intro">
          <h1>{staffEntry ? t("Your staff workspace.", "Tu espacio de trabajo.") : t("A little space for you.", "Un pequeño espacio para ti.")}</h1>
          <p>
            {staffEntry ? t("Sign in with your approved staff account. Your assigned role determines what you can see.", "Inicia sesión con tu cuenta de personal autorizada. Tu rol determina lo que puedes ver.") : t(
              "Sign in with the account from your student pilot invitation.",
              "Inicia sesión con la cuenta de tu invitación al piloto estudiantil.",
            )}
          </p>
        </div>
        <div className="student-card">
          {params.get("setup") === "complete" && <p role="status" className="student-success">{t("Your password is ready. Sign in below to open your workspace.", "Tu contraseña está lista. Inicia sesión abajo para abrir tu espacio.")}</p>}
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
              {staffEntry ? t("Staff access is assigned by the pilot operator. Signing in does not grant access to private student activity.", "El operador del piloto asigna el acceso al personal. Iniciar sesión no permite ver la actividad privada del alumnado.") : t(
                "This pilot is invitation-only. Need help with your account? Ask your school or pilot coordinator.",
                "Solo puedes entrar con una invitación. ¿Necesitas ayuda con tu cuenta? Consulta con tu escuela o con quien coordina el piloto.",
              )}
            </p>
          </form>
          <p><Link href="/student/account-setup">{t("Invited or forgot your password? Set up your password.", "¿Tienes invitación u olvidaste tu contraseña? Configura tu contraseña.")}</Link></p>
        </div>
        {staffEntry && <p><Link href="/student/staff">New staff member? Create an account and request your role.</Link></p>}
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
