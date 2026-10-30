export type VerifiedAccountRoles = {
  operator: boolean;
  staffRole: string | null;
  studentStatus: string | null;
};
export function accountDestination(roles: VerifiedAccountRoles) {
  if (roles.operator) return "/student/operator";
  if (roles.staffRole === "teacher") return "/student/teacher";
  if (["therapist", "school_staff"].includes(roles.staffRole ?? "")) return "/student/admin";
  // Invited/revoked students also belong in the student access-status flow,
  // never in an adult role application. This does not grant enrollment.
  if (roles.studentStatus !== null) return "/student";
  return "/student/staff";
}
