export const STUDENT_NOTICE_VERSION = "student-pilot-2026-10-26-v2";
export const STUDENT_GRADES = ["9", "10", "11", "12"] as const;

export type StudentMembership = {
  status: string;
  role: string;
  consent_verified_at: string | null;
};

// Never derive enrollment from user-editable auth metadata or a chosen grade.
export function canAccessStudentEdition(
  member: StudentMembership | null,
): boolean {
  return (
    member?.status === "active" &&
    member.role === "student" &&
    Boolean(member.consent_verified_at)
  );
}

export function isStudentEdition(value = process.env.ARIZE_EDITION): boolean {
  return value === "student";
}

export function isStudentRoute(pathname: string): boolean {
  return (
    pathname === "/student" ||
    pathname.startsWith("/student/") ||
    pathname === "/api/student" ||
    pathname.startsWith("/api/student/")
  );
}

export function isAllowedStudentDeploymentRoute(pathname: string): boolean {
  return (
    isStudentRoute(pathname) ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest"
  );
}

export function safeCounselorUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    // School-managed HTTPS booking/contact pages only; never javascript/data URLs.
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function validateStudentProfile(value: Record<string, unknown>) {
  const name =
    typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (!name || name.length > 50)
    return "Choose a name between 1 and 50 characters.";
  if (!STUDENT_GRADES.includes(value.grade as (typeof STUDENT_GRADES)[number]))
    return "Choose grade 9, 10, 11, or 12.";
  if (value.acknowledged !== true)
    return "Please read and acknowledge the student pilot notice.";
  return null;
}

export function validateCheckIn(value: Record<string, unknown>) {
  if (!validDay(value.day)) return "Choose a valid check-in day.";
  if (
    !Number.isInteger(value.score) ||
    Number(value.score) < 1 ||
    Number(value.score) > 10
  )
    return "Choose a feeling score from 1 to 10.";
  return null;
}

export function feelingLabel(score: number) {
  if (score <= 2) return "Having a hard time";
  if (score <= 4) return "Feeling low";
  if (score <= 6) return "Somewhere in the middle";
  if (score <= 8) return "Feeling good";
  return "Feeling great";
}
