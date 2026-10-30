import { createClient } from "@/lib/supabase/server";
import { verifiedAccountDestination } from "@/lib/student/account-server";
import { isStudentEdition } from "@/lib/student/policy";
import { studentNoStore } from "@/lib/student/server";
export async function GET() {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: studentNoStore });
  if (!isStudentEdition()) return reply({ error: "Not found" }, 404);
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return reply({ error: "Please sign in." }, 401);
  const destination = await verifiedAccountDestination(client, user.id);
  return destination ? reply({ destination }) : reply({ error: "Your account access could not be checked. Please try again." }, 503);
}
