import { validDay } from "./policy.ts";

export const GOAL_CATEGORIES = [
  "School",
  "Wellness",
  "Reflection",
  "Personal",
] as const;
export type StudentGoal = {
  id: string;
  title: string;
  day: string;
  week_of: string;
  category: string;
  deadline: string | null;
  notes: string;
  progress: number;
  is_complete: boolean;
  archived_at: string | null;
};
export const GOAL_FIELDS =
  "id,title,day,week_of,category,deadline,notes,progress,is_complete,archived_at";
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}
export function weekStart(day = dateKey()) {
  return shiftDay(day, -new Date(`${day}T12:00:00`).getDay());
}
export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function validateGoal(value: Record<string, unknown>) {
  if (!validDay(value.week) || weekStart(value.week) !== value.week)
    return { ok: false as const, error: "Choose a valid goal week." };
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";
  if (!title || title.length > 160 || notes.length > 1600)
    return {
      ok: false as const,
      error:
        "Use a goal of 1–160 characters and notes of up to 1,600 characters.",
    };
  if (
    !GOAL_CATEGORIES.includes(
      value.category as (typeof GOAL_CATEGORIES)[number],
    )
  )
    return { ok: false as const, error: "Choose a goal category." };
  const deadline =
    value.deadline === "" || value.deadline === null ? null : value.deadline;
  if (
    deadline !== null &&
    (!validDay(deadline) ||
      deadline < value.week ||
      deadline > shiftDay(value.week, 6))
  )
    return {
      ok: false as const,
      error:
        "Choose a deadline within this week, or leave it as a week-long goal.",
    };
  return {
    ok: true as const,
    goal: {
      title,
      notes,
      category: value.category as string,
      deadline: deadline as string | null,
      day: (deadline ?? value.week) as string,
    },
  };
}
export function pageOffset(value: string | null) {
  if (value === null) return 0;
  return /^\d{1,6}$/.test(value) && Number(value) <= 100000
    ? Number(value)
    : null;
}
