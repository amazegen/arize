import { createClient } from "@/lib/supabase/server";
import { isStudentEdition } from "@/lib/student/policy";
import { readStudentBody, studentNoStore } from "@/lib/student/server";
import { PRIVACY_KINDS, EXPORT_SECTIONS } from "@/lib/student/privacy";
import { validId } from "@/lib/student/features";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: studentNoStore });
export async function GET() {
  if (!isStudentEdition()) return reply({ error: "Not found" }, 404);
  const client = await createClient(); const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return reply({ error: "Please sign in." }, 401);
  const result = await client.rpc("student_privacy_self");
  if (result.error) return reply({ error: result.error.code === "42501" ? "These tools are available to student accounts, including former pilot students." : "Privacy tools are not available yet. You can use the contact information in the privacy policy." }, result.error.code === "42501" ? 403 : 503);
  return reply(result.data);
}
export async function POST(request: Request) {
  if (!isStudentEdition()) return reply({ error: "Not found" }, 404);
  const client = await createClient(); const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return reply({ error: "Please sign in." }, 401);
  const body = await readStudentBody(request);
  if (!body || body.confirmed !== true) return reply({ error: "Confirm your request first." }, 400);
  let name: string; let args: Record<string, unknown>;
  if (body.action === "request" && PRIVACY_KINDS.includes(body.kind as typeof PRIVACY_KINDS[number])) { name = "student_request_privacy"; args = { p_kind: body.kind }; }
  else if (body.action === "start-export") { name = "student_start_export"; args = {}; }
  else if (body.action === "export-page" && validId(body.exportId) && EXPORT_SECTIONS.includes(body.section as typeof EXPORT_SECTIONS[number]) && (body.after === undefined || typeof body.after === "string" && body.after.length <= 150)) { name = "student_export_page"; args = { p_export: body.exportId, p_section: body.section, p_after: body.after ?? "" }; }
  else return reply({ error: "Choose a valid privacy action." }, 400);
  const result = await client.rpc(name, args);
  if (result.error) return reply({ error: result.error.code === "P0002" ? "You have reached the daily privacy/export request limit. Try later." : "This request could not be completed. No records were deleted. Check your account access or the privacy-policy contact." }, result.error.code === "42501" ? 403 : result.error.code === "P0002" ? 429 : 503);
  if (body.action === "start-export") return reply({ exportId: result.data, account: { id: user.id, email: user.email } });
  if (body.action === "export-page") {
    const rows = result.data as { cursor: string; data: unknown }[];
    return reply({ items: rows.slice(0,50).map(row => row.data), nextKey: rows.length > 50 ? rows[49].cursor : null });
  }
  return reply({ requestId: result.data, message: "Your request is saved for review. This does not automatically delete data or change pilot access." });
}
