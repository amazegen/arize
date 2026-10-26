export function notificationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email)
  )
    return null;
  return email;
}

export function validateNotificationSettings(body: Record<string, unknown>) {
  const email = notificationEmail(body.email);
  if (!email)
    return {
      ok: false as const,
      error: "Enter one valid notification email address.",
    };
  if (email !== notificationEmail(body.confirmEmail))
    return { ok: false as const, error: "The email addresses do not match." };
  if (body.confirmed !== true)
    return {
      ok: false as const,
      error: "Confirm that this address belongs to an authorized counselor.",
    };
  return { ok: true as const, email };
}

export function resolveCounselorRecipient(config: {
  databaseEmail: string | null;
  schoolId: string;
  legacyEmail?: string;
  legacySchoolId?: string;
}) {
  // Never silently fall back if a saved setting exists but is invalid.
  if (config.databaseEmail !== null)
    return notificationEmail(config.databaseEmail);
  return config.schoolId === config.legacySchoolId
    ? notificationEmail(config.legacyEmail)
    : null;
}
