export const OPERATOR_VIEWS = ["overview", "schools", "staff", "reports", "clarity", "settings"] as const;
export type OperatorView = typeof OPERATOR_VIEWS[number];
export function operatorView(value: unknown): OperatorView {
  return OPERATOR_VIEWS.includes(value as OperatorView) ? value as OperatorView : "overview";
}
export function validSchoolName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 160 && !/[\r\n<>]/.test(value);
}
export function validStaffInvite(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
}
export type TestMessage = { role: "user" | "assistant"; content: string };
export function validOperatorTest(value: unknown): value is TestMessage[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 15 &&
    value.every((m, index) => m && m.role === (index % 2 === 0 ? "user" : "assistant") && typeof m.content === "string" && m.content.trim().length > 0 && m.content.length <= 2000) &&
    value[value.length - 1].role === "user" && value.reduce((n, m) => n + m.content.length, 0) <= 6500;
}
export type OperatorConfig = {
  aiEnabled: boolean; aiConfigured: boolean; model: string | null; promptVersion: string;
  staffSignupEnabled: boolean; counselorSendingEnabled: boolean;
};
