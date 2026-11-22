import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CONFIG, validateConfig, type ClarityEdition } from "./config";
export const consoleHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export function currentEdition(): ClarityEdition { return process.env.ARIZE_EDITION === "student" ? "student" : "adult"; }
export async function activeConfig(client: SupabaseClient, edition: ClarityEdition) {
  const result = await client.rpc("clarity_active_config", { p_edition: edition });
  // Backward-compatible while the new migration is awaiting an approved rollout.
  // An outage/malformed config falls back to the fixed, reviewed default, never to unchecked text.
  const checked = validateConfig(result.data?.config);
  return { config: checked.ok ? checked.config : DEFAULT_CONFIG[edition], version: checked.ok && typeof result.data?.id === "string" ? result.data.id : "built-in" };
}
export async function consoleSession(edition: ClarityEdition) {
  if (edition !== currentEdition()) return { ok: false as const, status: 404, error: "Not found." };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { ok: false as const, status: 503, error: "Backend is not configured." };
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Please sign in." };
  const permission = await supabase.rpc("clarity_console_allowed", { p_edition: edition });
  if (permission.error) return { ok: false as const, status: 503, error: "The configuration console is not installed or is temporarily unavailable." };
  if (permission.data !== true) return { ok: false as const, status: 403, error: "Verified Clarity administrator access is required. Complete MFA if enrolled." };
  return { ok: true as const, supabase, user };
}
export async function readConsoleBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 32768) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
