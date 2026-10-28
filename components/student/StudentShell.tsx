"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import StudentBrand from "./StudentBrand";
import { StudentLanguageSwitch, useStudentLanguage } from "./StudentLanguage";
import {
  ArrowLeft,
  Check,
  Home,
  MessageCircle,
  Target,
  UserRound,
} from "lucide-react";

export type StudentScreen =
  | "home"
  | "check-in"
  | "goals"
  | "clarity"
  | "counselor"
  | "profile"
  | "feedback"
  | "toolkit"
  | "class-reset";

export function StudentSafety() {
  const { t } = useStudentLanguage();
  return (
    <div className="student-safety">
      <p>
        {t(
          "Not an emergency service. Nobody is watching this chat live.",
          "No es un servicio de emergencias. Nadie observa este chat en vivo.",
        )}
      </p>
      <p>
        {t("In immediate danger, call", "En peligro inmediato, llama al")}{" "}
        <a href="tel:911">911</a>.{" "}
        {t(
          "For crisis support in the U.S., call or text",
          "Para apoyo en una crisis en EE. UU., llama o envía un texto al",
        )}{" "}
        <a href="tel:988?oai_link_source=model_response_hotline">988</a>.
      </p>
    </div>
  );
}

export function StudentAccessMessage({ message }: { message: string }) {
  const { t } = useStudentLanguage();
  return (
    <div className="student-wrap">
      <header className="student-header">
        <Link className="student-brand" href="/student">
          <StudentBrand />
        </Link>
      </header>
      <main className="student-main student-narrow">
        <h1>{t("Student pilot", "Piloto estudiantil")}</h1>
        <p className="student-error" role="alert">
          {message}
        </p>
        <p>
          {t(
            "Student access is invitation-only. Signing in does not enroll you or approve school consent.",
            "Solo puedes acceder al piloto con una invitación. Iniciar sesión no te inscribe ni aprueba el permiso escolar.",
          )}{" "}
        </p>
        <div className="student-inline" style={{ margin: "24px 0" }}>
          <Link className="student-action" href="/student/sign-in">
            {t("Student sign-in", "Acceso estudiantil")}{" "}
          </Link>
        </div>
        <StudentSafety />
      </main>
    </div>
  );
}

export function StudentShell({
  children,
  name,
  screen,
  onNavigate,
  preview = false,
  onRequestCounselor,
  counselorStatus = "idle",
  counselorDisabled = false,
}: {
  children: React.ReactNode;
  name: string;
  screen: StudentScreen;
  onNavigate: (screen: StudentScreen) => void;
  preview?: boolean;
  onRequestCounselor?: () => void;
  counselorStatus?: "idle" | "sending" | "sent" | "pending" | "preview";
  counselorDisabled?: boolean;
}) {
  const { language, t } = useStudentLanguage();
  const wrapRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const nav = navRef.current;
    if (!wrap || !nav) return;
    // Match the real navigation height, including font zoom and safe-area padding.
    // A fixed offset leaves a window for chat bubbles to peek through on phones.
    const syncHeight = () => {
      wrap.style.setProperty(
        "--student-nav-height",
        `${nav.getBoundingClientRect().height}px`,
      );
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  const tabs = [
    { id: "home", label: t("Home", "Inicio"), Icon: Home },
    { id: "goals", label: t("Goals", "Metas"), Icon: Target },
    { id: "clarity", label: "Clarity", Icon: MessageCircle },
    { id: "profile", label: t("Profile", "Perfil"), Icon: UserRound },
  ] as const;
  return (
    <>
      {preview ? (
        <div className="student-preview-label">
          {t(
            "Design preview · Sample data only · No student information is saved",
            "Vista de diseño · Solo datos de ejemplo · No se guarda información estudiantil",
          )}{" "}
        </div>
      ) : null}
      <a className="student-skip" href="#student-main">
        {t("Skip to content", "Ir al contenido")}{" "}
      </a>
      <div className="student-wrap" ref={wrapRef} lang={language}>
        <header className="student-header">
          <a
            href="/student"
            className="student-brand"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("home");
            }}
          >
            <StudentBrand />
          </a>
          <div className="student-header-actions">
            {onRequestCounselor ? (
              <button
                type="button"
                className="student-counselor-shortcut"
                onClick={onRequestCounselor}
                aria-label={
                  counselorStatus === "sent"
                    ? t(
                        "Counselor request sent",
                        "Solicitud al consejero enviada",
                      )
                    : counselorStatus === "sending"
                      ? t(
                          "Sending counselor request",
                          "Enviando solicitud al consejero",
                        )
                      : counselorStatus === "pending"
                        ? t(
                            "Counselor request confirmation pending",
                            "Confirmación de solicitud al consejero pendiente",
                          )
                        : t(
                            "Talk to your counselor — send a request to Shelby",
                            "Habla con tu consejero: envía una solicitud a Shelby",
                          )
                }
                title={t(
                  "Send only your preferred name and a request to connect. No chats, goals, or scores.",
                  "Envía solo tu nombre preferido y una solicitud de contacto. Sin chats, metas ni puntuaciones.",
                )}
                disabled={
                  counselorDisabled ||
                  counselorStatus === "sending" ||
                  counselorStatus === "sent" ||
                  counselorStatus === "pending"
                }
              >
                {counselorStatus === "sent" ? (
                  <Check size={20} aria-hidden />
                ) : (
                  <MessageCircle size={20} aria-hidden />
                )}
                <span>
                  {counselorStatus === "sent" ? (
                    <>
                      {t("Request", "Solicitud")}{" "}
                      <strong>{t("sent", "enviada")}</strong>
                    </>
                  ) : counselorStatus === "sending" ? (
                    <>
                      {t("Sending", "Enviando")}{" "}
                      <strong>{t("request…", "solicitud…")}</strong>
                    </>
                  ) : counselorStatus === "pending" ? (
                    <>
                      {t("Confirmation", "Confirmación")}{" "}
                      <strong>{t("pending", "pendiente")}</strong>
                    </>
                  ) : (
                    <>
                      {t("Talk to your", "Habla con tu")}{" "}
                      <strong>{t("counselor", "consejero")}</strong>
                    </>
                  )}
                </span>
              </button>
            ) : null}
            <a
              className="student-avatar"
              href="/student?screen=profile"
              aria-label={t("Your profile", "Tu perfil")}
              onClick={(e) => {
                e.preventDefault();
                onNavigate("profile");
              }}
            >
              {name.slice(0, 1).toUpperCase() || <UserRound size={24} />}
            </a>
          </div>
        </header>
        <main id="student-main" className="student-main">
          <div className="student-language-row">
            <StudentLanguageSwitch />
          </div>
          {screen !== "home" ? (
            <a
              className="student-back"
              href="/student"
              onClick={(e) => {
                e.preventDefault();
                onNavigate("home");
              }}
            >
              <ArrowLeft size={18} /> {t("Back home", "Volver al inicio")}
            </a>
          ) : null}
          {children}
        </main>
      </div>
      <nav
        ref={navRef}
        className="student-nav"
        aria-label={t("Student navigation", "Navegación estudiantil")}
      >
        {tabs.map(({ id, label, Icon }) => (
          <a
            key={id}
            href={`/student?screen=${id}`}
            aria-current={screen === id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(id);
            }}
          >
            <span className="nav-icon">
              <Icon size={25} />
            </span>
            {label}
          </a>
        ))}
      </nav>
    </>
  );
}
