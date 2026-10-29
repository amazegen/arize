type SignupResult = {
  error: { code?: string } | null;
  data: { session?: unknown; user?: { identities?: unknown[] } | null };
};
// Supabase may return an obfuscated user for a confirmed email instead of an
// explicit error. Do not mistake that response for a newly created account.
export function staffSignupOutcome(result: SignupResult): "existing" | "confirmation" | "signed-in" | "error" {
  if (result.error) return ["user_already_exists", "email_exists"].includes(result.error.code ?? "") ? "existing" : "error";
  if (result.data.session) return "signed-in";
  if (Array.isArray(result.data.user?.identities) && result.data.user.identities.length === 0) return "existing";
  return "confirmation";
}
