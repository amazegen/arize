"use client";

import Link from "next/link";
import StudentBrand from "./StudentBrand";
import {
  ArrowLeft,
  Check,
  Home,
  MessageCircle,
  Target,
  UserRound,
} from "lucide-react";

export type StudentScreen =
  "home" | "check-in" | "goals" | "clarity" | "counselor" | "profile";

export function StudentSafety() {
  return (
    <div className="student-safety">
      <p>Not an emergency service. Nobody is watching this chat live.</p>
      <p>
        In immediate danger, call <a href="tel:911">911</a>. For crisis support
        in the U.S., call or text{" "}
        <a href="tel:988?oai_link_source=model_response_hotline">988</a>.
      </p>
    </div>
  );
}

export function StudentAccessMessage({ message }: { message: string }) {
  return (
    <div className="student-wrap">
      <header className="student-header">
        <Link className="student-brand" href="/student">
          <StudentBrand />
        </Link>
      </header>
      <main className="student-main student-narrow">
        <h1>Student pilot</h1>
        <p className="student-error" role="alert">
          {message}
        </p>
        <p>
          Student access is invitation-only. Signing in does not enroll you or
          approve school consent.
        </p>
        <div className="student-inline" style={{ margin: "24px 0" }}>
          <Link className="student-action" href="/student/sign-in">
            Student sign-in
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
  const tabs = [
    { id: "home", label: "Home", Icon: Home },
    { id: "goals", label: "Goals", Icon: Target },
    { id: "clarity", label: "Clarity", Icon: MessageCircle },
    { id: "profile", label: "Profile", Icon: UserRound },
  ] as const;
  return (
    <>
      {preview ? (
        <div className="student-preview-label">
          Design preview · Sample data only · No student information is saved
        </div>
      ) : null}
      <a className="student-skip" href="#student-main">
        Skip to content
      </a>
      <div className="student-wrap">
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
                    ? "Counselor request sent"
                    : counselorStatus === "sending"
                      ? "Sending counselor request"
                      : counselorStatus === "pending"
                        ? "Counselor request confirmation pending"
                        : "Talk to your counselor — send a request to Shelby"
                }
                title="Send only your preferred name and a request to connect. No chats, goals, or scores."
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
                      Request <strong>sent</strong>
                    </>
                  ) : counselorStatus === "sending" ? (
                    <>
                      Sending <strong>request…</strong>
                    </>
                  ) : counselorStatus === "pending" ? (
                    <>
                      Confirmation <strong>pending</strong>
                    </>
                  ) : (
                    <>
                      Talk to your <strong>counselor</strong>
                    </>
                  )}
                </span>
              </button>
            ) : null}
            <a
              className="student-avatar"
              href="/student?screen=profile"
              aria-label="Your profile"
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
          {screen !== "home" ? (
            <a
              className="student-back"
              href="/student"
              onClick={(e) => {
                e.preventDefault();
                onNavigate("home");
              }}
            >
              <ArrowLeft size={18} /> Back home
            </a>
          ) : null}
          {children}
        </main>
      </div>
      <nav className="student-nav" aria-label="Student navigation">
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
