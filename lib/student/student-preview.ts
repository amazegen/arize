export const ADMIN_STUDENT_VIEW = "/student/operator/student-view";
export const STUDENT_PREVIEW_SCREENS = [
  "home", "check-in", "goals", "clarity", "counselor", "profile",
  "feedback", "toolkit", "class-reset",
] as const;

export function studentPreviewScreen(value: unknown): typeof STUDENT_PREVIEW_SCREENS[number] {
  return typeof value === "string" && STUDENT_PREVIEW_SCREENS.some(screen => screen === value)
    ? value as typeof STUDENT_PREVIEW_SCREENS[number]
    : "home";
}

// Preview navigation never accepts a user-controlled URL or changes live routing.
export function studentWorkspacePath(preview: boolean, adminPreview: boolean) {
  return !preview ? "/student" : adminPreview ? ADMIN_STUDENT_VIEW : "/student-design";
}
