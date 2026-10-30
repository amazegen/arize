export const PRIVACY_KINDS = ["access", "correction", "deletion", "withdrawal"] as const;
export const PRIVACY_STATUSES = ["in_review", "awaiting_owner", "closed"] as const;
export const EXPORT_SECTIONS = ["profile","enrollment","checkIns","goals","conversations","messages","counselorRequests","belonging","topics","coachUsage","aiRequests","privacyRequests","enrollmentHistory"] as const;
export function validPrivacyReview(value: Record<string, unknown>) {
  return validId(value.requestId) && PRIVACY_STATUSES.includes(value.status as typeof PRIVACY_STATUSES[number]) && typeof value.reference === "string" && value.reference.trim().length >= 3 && value.reference.length <= 200 && value.confirmed === true;
}
import { validId } from "./features.ts";
