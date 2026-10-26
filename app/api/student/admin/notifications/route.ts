import {
  getNotificationAdminSession,
  loadNotificationSettings,
} from "@/lib/student/admin-server";
import { validateNotificationSettings } from "@/lib/student/notification-settings";
import { readStudentBody, studentNoStore } from "@/lib/student/server";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });

export async function GET() {
  const session = await getNotificationAdminSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const settings = await loadNotificationSettings(session);
  return settings
    ? reply(settings)
    : reply({ error: "Notification settings could not be loaded." }, 503);
}

export async function PUT(request: Request) {
  const session = await getNotificationAdminSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const body = await readStudentBody(request);
  if (!body)
    return reply({ error: "A valid settings request is required." }, 400);
  const validated = validateNotificationSettings(body);
  if (!validated.ok) return reply({ error: validated.error }, 400);
  // The database derives school + actor from the verified account, not input.
  const { error } = await session.supabase.rpc("student_save_counselor_email", {
    p_email: validated.email,
  });
  if (error)
    return reply(
      {
        error:
          "The email could not be saved. Please check your staff access and try again.",
      },
      503,
    );
  const settings = await loadNotificationSettings(session);
  if (!settings)
    return reply(
      {
        error:
          "The change was submitted, but its saved status could not be loaded. Reload before retrying.",
      },
      503,
    );
  return reply(settings);
}
