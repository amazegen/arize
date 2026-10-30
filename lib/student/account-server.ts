import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountDestination } from "./account-destination";

export async function verifiedAccountDestination(client: SupabaseClient, userId: string) {
  const [operator, staff, student] = await Promise.all([
    client.from("student_operators").select("active").eq("user_id", userId).eq("active", true).maybeSingle(),
    client.from("student_staff_memberships").select("role").eq("user_id", userId).eq("active", true).maybeSingle(),
    client.from("student_pilot_memberships").select("status").eq("user_id", userId).maybeSingle(),
  ]);
  if (operator.error || staff.error || student.error) return null;
  return accountDestination({ operator: operator.data?.active === true, staffRole: staff.data?.role ?? null, studentStatus: student.data?.status ?? null });
}
