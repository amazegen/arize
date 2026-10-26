"use client";

import { useState } from "react";
import Link from "next/link";
import StudentBrand from "./StudentBrand";
import { validateNotificationSettings } from "@/lib/student/notification-settings";

type AuditEntry = {
  id: string;
  old_email: string | null;
  new_email: string;
  changed_at: string;
};
export type NotificationSettingsData = {
  email: string | null;
  updatedAt: string | null;
  history: AuditEntry[];
};

export default function StudentNotificationSettings({
  initial,
  schoolName,
  preview = false,
}: {
  initial: NotificationSettingsData;
  schoolName: string;
  preview?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [email, setEmail] = useState(initial.email ?? "");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const validated = validateNotificationSettings({
      email,
      confirmEmail,
      confirmed,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    setBusy(true);
    try {
      let next: NotificationSettingsData;
      if (preview) {
        const at = new Date().toISOString();
        next = {
          email: validated.email,
          updatedAt: at,
          history: [
            {
              id: crypto.randomUUID(),
              old_email: saved.email,
              new_email: validated.email,
              changed_at: at,
            },
            ...saved.history,
          ],
        };
      } else {
        const response = await fetch("/api/student/admin/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: validated.email,
            confirmEmail,
            confirmed,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Your change could not be saved.");
        next = result;
      }
      setSaved(next);
      setEmail(next.email ?? "");
      setConfirmEmail("");
      setConfirmed(false);
      setMessage(
        preview
          ? "Preview saved only. No real email address or delivery setting was changed."
          : "Notification email saved. New requests will use this address; requests already in progress keep their original destination.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="student-admin-settings">
      <header className="student-header">
        <Link
          className="student-brand"
          href={
            preview
              ? "/student-design?screen=admin-notifications"
              : "/student/admin/notifications"
          }
        >
          <StudentBrand />
        </Link>
        <span className="student-edition-label">Staff administration</span>
      </header>
      <main className="student-main">
        <div className="student-intro">
          <h1>Counselor Notifications</h1>
          <p>{schoolName} · Authorized staff only</p>
        </div>
        {preview ? (
          <div className="student-note" style={{ marginBottom: 24 }}>
            <strong>Admin preview · Sample data only</strong>
            <p>
              This form demonstrates the setting. It does not grant staff access
              or change the real counselor email.
            </p>
          </div>
        ) : null}
        <section className="student-card">
          <h2>Notification email</h2>
          <p style={{ margin: "12px 0 24px" }}>
            Student-initiated counselor requests are sent to this address.
            Students cannot view or change this setting.
          </p>
          <p style={{ marginBottom: 24 }}>
            Current destination:{" "}
            <strong>{saved.email || "Not configured"}</strong>
          </p>
          <form className="student-form" onSubmit={save}>
            <label>
              New notification email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Confirm new email
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                maxLength={254}
                required
                autoComplete="off"
              />
            </label>
            <label className="student-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              <span>
                I confirm this address belongs to an authorized counselor and
                may receive student requests.
              </span>
            </label>
            {error ? (
              <p className="student-error" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="student-success" role="status">
                {message}
              </p>
            ) : null}
            <button className="student-action" disabled={busy || !confirmed}>
              {busy ? "Saving…" : "Save notification email"}
            </button>
          </form>
          <p style={{ marginTop: 22 }}>
            Changes apply to new requests without a code update or redeployment.
            Saving does not send an email or enable delivery. The verified
            sender, email-service connection, and school approval are still
            required.
          </p>
        </section>
        <section className="student-card" style={{ marginTop: 24 }}>
          <h2>Recent changes</h2>
          {saved.history.length ? (
            <ul className="student-admin-history">
              {saved.history.map((item) => (
                <li key={item.id}>
                  <strong>{item.new_email}</strong>
                  <p>
                    {item.old_email
                      ? `Previously ${item.old_email}`
                      : "Initial destination set"}{" "}
                    ·{" "}
                    <time dateTime={item.changed_at}>
                      {new Date(item.changed_at).toLocaleString()}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ marginTop: 14 }}>
              No saved changes yet. All changes are recorded with the staff
              account and time.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
