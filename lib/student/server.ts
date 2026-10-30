import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canAccessStudentEdition, isStudentEdition } from "./policy";

export async function getStudentSession() {
  if (!isStudentEdition())
    return { ok: false as const, status: 404, error: "Not found" };
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return {
      ok: false as const,
      status: 503,
      error: "The student pilot is not configured yet.",
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return { ok: false as const, status: 401, error: "Please sign in." };
  const { data: membership, error } = await supabase
    .from("student_pilot_memberships")
    .select("school_id, status, role, consent_verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  // Fail closed for missing migrations, revoked enrollment, and unverified consent.
  if (error)
    return {
      ok: false as const,
      status: 503,
      error: "Student access is temporarily unavailable.",
    };
  if (!canAccessStudentEdition(membership))
    return {
      ok: false as const,
      status: 403,
      error:
        "This pilot is available only to approved students. Ask your school or pilot coordinator about your invitation.",
    };
  return { ok: true as const, supabase, user, membership: membership! };
}

export async function readStudentBody(
  request: Request,
  maxBytes = 8_192,
): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    return null;
  // Reject cross-origin browser writes; enrollment is still checked on every request.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = JSON.parse(raw);
    return body && typeof body === "object" && !Array.isArray(body)
      ? body
      : null;
  } catch {
    return null;
  }
}

export const studentNoStore = { "Cache-Control": "private, no-store" };
