export const STAFF_ROLES = ["therapist", "school_staff"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const FOLLOWUP_STAGES = ["new", "acknowledged", "contacted", "closed"] as const;
export type FollowupStage = (typeof FOLLOWUP_STAGES)[number];
export type SupportRequest = {
  id: string;
  display_name: string;
  delivery_status: "pending" | "sent" | "failed";
  created_at: string;
  stage: FollowupStage;
  updated_at: string | null;
};
export type SchoolReport = {
  month: string;
  published_at: string;
  report: { cohort: string | null; checkins: string | null; goals: string | null; clarity: string | null; minimumGroup: number; status: string } & ReportInsights;
};
export type StaffDashboardData = {
  role: StaffRole;
  schoolName: string;
  requests: SupportRequest[];
  hasMore: boolean;
  reportingApproved: boolean;
  reports: SchoolReport[];
};
export function validFollowup(value: unknown): value is FollowupStage {
  return FOLLOWUP_STAGES.includes(value as FollowupStage);
}
// Defense-in-depth DTO: school viewers never receive a therapist request array.
export function staffDashboardDTO(value: StaffDashboardData): StaffDashboardData {
  return {
    role: value.role,
    schoolName: value.schoolName,
    requests: value.role === "therapist" ? value.requests.map((r) => ({
      id: r.id, display_name: r.display_name, delivery_status: r.delivery_status,
      created_at: r.created_at, stage: r.stage, updated_at: r.updated_at,
    })) : [],
    hasMore: value.role === "therapist" && value.hasMore,
    reportingApproved: value.role === "school_staff" && value.reportingApproved,
    reports: value.role === "school_staff" && value.reportingApproved ? value.reports.map((r) => ({
      month: r.month, published_at: r.published_at,
      report: { cohort: r.report.cohort, checkins: r.report.checkins, goals: r.report.goals, clarity: r.report.clarity, minimumGroup: 10, status: r.report.status, ...reportInsights(r.report) },
    })) : [],
  };
}
import { reportInsights, type ReportInsights } from "./reporting.ts";
