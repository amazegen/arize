// Explicit allowlist only. SDK errors can contain request bodies and credentials.
export function studentProviderFailure(stage: string, error: unknown) {
  const status =
    error && typeof error === "object" && "status" in error
      ? error.status
      : null;
  return {
    event: "student_coach_provider_failure",
    stage,
    status:
      typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
        ? status
        : null,
  };
}
