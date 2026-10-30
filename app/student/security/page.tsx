import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountSecurity from "@/components/student/AccountSecurity";
export const dynamic = "force-dynamic";
export default async function AccountSecurityPage() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/student/sign-in");
  return <AccountSecurity />;
}
