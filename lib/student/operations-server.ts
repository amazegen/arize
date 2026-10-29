import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isStudentEdition } from "./policy";
import type { OperationsState } from "./operations";
export async function getOperationsSession() {
  if (!isStudentEdition()) return { ok: false as const, status: 404, error: "Not found" };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return { ok: false as const, status: 503, error: "The staff backend is not configured." };
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Please sign in." };
  const result = await supabase.rpc("student_operations_state");
  if (result.error) return { ok: false as const, status: 503, error: "Staff onboarding is not available yet." };
  return { ok: true as const, supabase, user, state: result.data as OperationsState };
}
