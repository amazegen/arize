import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudentPrivacyTools from "@/components/student/StudentPrivacyTools";
import StudentBrand from "@/components/student/StudentBrand";
export const dynamic = "force-dynamic";
export default async function StudentPrivacyPage() {
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/student/sign-in");
  return <div className="student-wrap"><header className="student-header"><Link className="student-brand" href="/student"><StudentBrand /></Link></header><main className="student-main student-narrow"><StudentPrivacyTools /></main></div>;
}
