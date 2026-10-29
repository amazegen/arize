import type { StaffDashboardData, StaffRole } from "./staff";
export function staffPreview(role: StaffRole): StaffDashboardData {
  return {
    role, schoolName: "Sample pilot school", hasMore: false,
    requests: role === "therapist" ? [
      { id: "a1000000-0000-4000-8000-000000000001", display_name: "Sample student A", delivery_status: "sent", created_at: "2026-10-28T14:30:00Z", stage: "new", updated_at: null },
      { id: "a1000000-0000-4000-8000-000000000002", display_name: "Sample student B", delivery_status: "pending", created_at: "2026-10-27T15:00:00Z", stage: "acknowledged", updated_at: null },
      { id: "a1000000-0000-4000-8000-000000000003", display_name: "Sample student C", delivery_status: "failed", created_at: "2026-10-26T16:00:00Z", stage: "contacted", updated_at: null },
    ] : [],
    reportingApproved: role === "school_staff",
    reports: role === "school_staff" ? [{ month: "2026-09-01", published_at: "2026-10-01T12:00:00Z", report: { cohort: "40–49", checkins: "20–29", goals: null, clarity: "10–19", minimumGroup: 10, status: "published" } }] : [],
  };
}
