import "server-only";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export function trustedAIRequest(userId: string, requestId: string, channel: "student" | "operator", payload: unknown) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new Error("Student server is not configured");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }) },
  });
  const fingerprint = createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex");
  return {
    begin: () => client.rpc("student_begin_ai_request", { p_user: userId, p_request: requestId, p_channel: channel, p_fingerprint: fingerprint }),
    store: (conversationId: string | null, content: string) => client.rpc("student_store_approved_turn", { p_user: userId, p_request: requestId, p_conversation: conversationId, p_content: content }),
    finish: (state: "completed" | "blocked" | "failed", content: string | null = null) => client.rpc("student_finish_ai_request", { p_user: userId, p_request: requestId, p_channel: channel, p_state: state, p_reply: content }),
  };
}

export function requestFailure(code?: string) {
  if (code === "P0002") return { status: 429, error: "You have reached the pilot message limit. Please try later." };
  if (code === "55P03") return { status: 409, error: "Another message is still processing. Please wait before sending again." };
  if (code === "42501") return { status: 403, error: "Your access changed. Please sign in again." };
  return { status: 503, error: "This message could not be started safely. Please try later." };
}

export const validRequestId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
