import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function staffAssurance(client: SupabaseClient) {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { ok: false, status: 503, error: "Account security could not be checked. Please try again." };
  if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") return { ok: false, status: 403, error: "Complete your authenticator verification at Account security before opening your staff workspace." };
  return { ok: true, status: 200, error: "" };
}
