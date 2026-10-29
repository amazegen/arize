export const BELONGING_NOTICE = "belonging-pilot-2026-10-29-v2";
export function validateBelonging(value: Record<string, unknown>) {
  if (value.acknowledged !== true || value.noticeVersion !== BELONGING_NOTICE)
    return {
      ok: false as const,
      error: "Read the belonging survey notice before saving.",
    };
  const keys = ["welcome", "trusted_adult", "connection"] as const;
  const scores = keys.map((key) =>
    value[key] === null || value[key] === "" ? null : value[key],
  );
  if (
    scores.every((score) => score === null) ||
    scores.some(
      (score) =>
        score !== null &&
        (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 5),
    )
  )
    return {
      ok: false as const,
      error:
        "Choose a score from 1 to 5 for at least one question, or skip the survey.",
    };
  if (value.language !== "en" && value.language !== "es")
    return { ok: false as const, error: "Choose English or Spanish." };
  return {
    ok: true as const,
    scores: {
      welcome: scores[0] as number | null,
      trusted_adult: scores[1] as number | null,
      connection: scores[2] as number | null,
    },
    language: value.language,
  };
}
