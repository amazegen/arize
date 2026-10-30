"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { passwordSetupError, validSetupToken } from "@/lib/student/account-setup";
import StudentBrand from "@/components/student/StudentBrand";
import { StudentLanguageProvider, StudentLanguageSwitch, useStudentLanguage } from "@/components/student/StudentLanguage";

export default function AccountSetupPage() {
  return <StudentLanguageProvider><AccountSetupForm /></StudentLanguageProvider>;
}
function AccountSetupForm() {
  const { language, t } = useStudentLanguage();
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
      const response = await fetch("/api/student/auth/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      setToken(null);
      if (!response.ok) { setPhase("recover"); throw new Error(t(result.error || "Could not verify this link.", "No pudimos verificar el enlace. Solicita un correo nuevo.")); }
      setPhase("password");
    } catch (reason) { setError(reason instanceof Error && reason.name === "Error" ? reason.message : t("Could not verify your link. Please try again.", "No pudimos verificar tu enlace. Inténtalo de nuevo.")); }
    finally { setBusy(false); }
  }
  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    try {
      const problem = passwordSetupError(password, String(form.get("confirmation") ?? ""));
      if (problem) throw new Error(t(problem, "Usa entre 12 y 128 caracteres y confirma la misma contraseña."));
      const client = createClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) { setPhase("recover"); throw new Error(t("Your setup session expired. Request a new email below.", "Tu sesión expiró. Solicita un correo nuevo abajo.")); }
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw new Error(t("We could not save that password. Try a different strong password or request a new setup email.", "No pudimos guardar esa contraseña. Prueba otra contraseña segura o solicita un correo nuevo."));
      const signedOut = await client.auth.signOut({ scope: "local" });
      if (signedOut.error) throw new Error(t("Password saved, but sign-out could not finish. Close this tab and sign in again.", "La contraseña se guardó, pero no pudimos cerrar la sesión. Cierra esta pestaña e inicia sesión otra vez."));
      setPhase("done");
      window.location.replace("/student/sign-in?setup=complete");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your password. Please try again."); }
    finally { setBusy(false); }
  }
  async function requestEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const { error: sendError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback` });
      if (sendError) throw new Error(t("We could not send a setup email right now. Please wait a moment and try again.", "No pudimos enviar el correo ahora. Espera un momento e inténtalo otra vez."));
      setMessage(t("If an account exists for that email, you’ll receive an Arize password setup email. Check your inbox and spam folder, then open the newest link.", "Si existe una cuenta con ese correo, recibirás un mensaje de Arize para configurar tu contraseña. Revisa tu bandeja de entrada y correo no deseado y abre el enlace más reciente."));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not request your email. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="student-wrap student-auth-wrap" lang={language}>
    <header className="student-header"><Link className="student-brand" href="/student/sign-in"><StudentBrand /></Link><StudentLanguageSwitch /></header>
    <main className="student-main student-narrow">
      <div className="student-intro"><p className="staff-eyebrow">{t("ACCOUNT SETUP", "CONFIGURA TU CUENTA")}</p><h1>{phase === "recover" ? t("Let’s get you signed in.", "Vamos a iniciar tu sesión.") : t("Welcome to Arize.", "Te damos la bienvenida a Arize.")}</h1><p>{t("Verify your email, choose your password, then sign in to your assigned workspace.", "Verifica tu correo, elige una contraseña e inicia sesión en tu espacio asignado.")}</p></div>
      <section className="student-card" aria-busy={busy}>
        {error && <p role="alert" className="student-error">{error}</p>}
        {message && <p role="status" className="student-success">{message}</p>}
        {phase === "loading" && <p role="status">{t("Checking your setup link…", "Revisando tu enlace…")}</p>}
        {phase === "verify" && <><h2>{t("Step 1: Verify your email", "Paso 1: Verifica tu correo")}</h2><p>{t("This secure, one-time link lets you set your own password. Arize will never ask you to email your password.", "Este enlace seguro de un solo uso te permite crear tu contraseña. Arize nunca te pedirá enviarla por correo.")}</p><button className="student-action" disabled={busy} onClick={verify}>{busy ? t("Verifying…", "Verificando…") : t("Continue to create password", "Continuar para crear la contraseña")}</button></>}
        {phase === "password" && <form className="student-form" onSubmit={savePassword}><h2>{t("Step 2: Create your password", "Paso 2: Crea tu contraseña")}</h2><p>{t("Use 12–128 characters. A unique passphrase is a good choice.", "Usa entre 12 y 128 caracteres. Una frase única es una buena opción.")}</p><label>{t("New password", "Nueva contraseña")}<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label>{t("Confirm password", "Confirma tu contraseña")}<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><button className="student-action" disabled={busy}>{busy ? t("Saving…", "Guardando…") : t("Save password and go to sign-in", "Guardar e ir a iniciar sesión")}</button></form>}
        {phase === "recover" && <form className="student-form" onSubmit={requestEmail}><h2>{t("Get a new password setup link", "Obtén un enlace nuevo para tu contraseña")}</h2><p>{t("Already opened your invitation, or the link expired? Enter the email from your invitation. Creating a password does not change your assigned permissions.", "¿Ya abriste la invitación o venció el enlace? Introduce el correo de tu invitación. Crear una contraseña no cambia tus permisos.")}</p><label>{t("Email", "Correo electrónico")}<input name="email" type="email" autoComplete="username" maxLength={254} required /></label><button className="student-action" disabled={busy}>{busy ? t("Sending…", "Enviando…") : t("Send password setup email", "Enviar correo para configurar contraseña")}</button></form>}
        {phase === "done" && <p role="status">{t("Password saved. Taking you to sign-in…", "Contraseña guardada. Te llevamos al inicio de sesión…")}</p>}
      </section>
      <p><Link href="/student/sign-in">{t("Already have a password? Sign in", "¿Ya tienes contraseña? Inicia sesión")}</Link></p>
      <p>{t("Your assigned role controls your workspace. A setup link never grants administrator access by itself.", "Tu rol asignado controla tu espacio. Un enlace de configuración no te da acceso de administrador.")}</p>
    </main>
  </div>;
}
