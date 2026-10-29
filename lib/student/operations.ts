export const REQUESTABLE_STAFF_ROLES = ["therapist", "teacher", "school_staff"] as const;
export type RequestedStaffRole = typeof REQUESTABLE_STAFF_ROLES[number];
export type OperationsState = {
  operator: boolean; role: RequestedStaffRole | null; schoolId: string | null; schoolName: string | null;
  application: { display_name: string; school_name: string; requested_role: RequestedStaffRole; status: string } | null;
  features: { attendance: boolean; topics: boolean; ambassadors: boolean };
  classes: { id: string; label: string }[];
  records: { classroom_id: string; day: string; enrolled: number; present: number; absent: number; reset_lesson: string | null }[];
};
export type OperatorOverview = {
  schools: { id: string; name: string; scope: { attendance: boolean; topics: boolean; belonging: boolean; ambassadors: boolean; reporting: boolean }; reference: string | null }[];
  applications: { user_id: string; display_name: string; school_name: string; requested_role: RequestedStaffRole; email: string; submitted_at: string }[];
  staff: { user_id: string; role: RequestedStaffRole; school_name: string; display_name: string | null; email: string | null }[];
  reports: (SchoolReport & { schoolId: string; schoolName: string })[];
  kpis: { schools: number; approved_students: number; approved_staff: number; published_reports: number };
};
export function validAttendance(value: Record<string, unknown>): boolean {
  return [value.enrolled, value.present, value.absent].every((n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 500)
    && Number(value.enrolled) >= 1 && Number(value.present) + Number(value.absent) === value.enrolled;
}
export function staffDestination(state: Pick<OperationsState, "operator" | "role">) {
  return state.operator ? "/student/operator" : state.role === "teacher" ? "/student/teacher" : state.role ? "/student/admin" : "/student/staff";
}
import { staffDashboardDTO, type SchoolReport } from "./staff.ts";
export function operatorOverviewDTO(value: OperatorOverview): OperatorOverview {
  const safe=staffDashboardDTO({role:"school_staff",schoolName:"",requests:[],hasMore:false,reportingApproved:true,reports:value.reports??[]}).reports;
  return {
    schools:value.schools.map(s=>({id:s.id,name:s.name,reference:s.reference,scope:{attendance:s.scope.attendance,topics:s.scope.topics,belonging:s.scope.belonging,ambassadors:s.scope.ambassadors,reporting:s.scope.reporting}})),
    applications:value.applications.map(a=>({user_id:a.user_id,display_name:a.display_name,school_name:a.school_name,requested_role:a.requested_role,email:a.email,submitted_at:a.submitted_at})),
    staff:value.staff.map(s=>({user_id:s.user_id,role:s.role,school_name:s.school_name,display_name:s.display_name,email:s.email})),
    reports:safe.map((r,i)=>({...r,schoolId:value.reports[i].schoolId,schoolName:value.reports[i].schoolName})),
    kpis:{schools:value.kpis.schools,approved_students:value.kpis.approved_students,approved_staff:value.kpis.approved_staff,published_reports:value.kpis.published_reports},
  };
}
