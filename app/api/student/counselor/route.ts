import { createClient } from "@supabase/supabase-js";
import {
  getStudentSession,
  readStudentBody,
  studentNoStore,
} from "@/lib/student/server";
import { STUDENT_NOTICE_VERSION } from "@/lib/student/policy";
import { deliverCounselorRequest } from "@/lib/student/counselor-notification";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: studentNoStore });

export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session.ok) return reply({ error: session.error }, session.status);
  const body = await readStudentBody(request);
  if (
    typeof body?.requestId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      body.requestId,
    )
  )
    return reply({ error: "A valid request reference is required." }, 400);
  const { supabase, user, membership } = session;
  const [{ data: profile }, { data: school }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("notice_version")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("student_schools")
      .select("id")
      .eq("id", membership.school_id)
      .single(),
  ]);
  if (profile?.notice_version !== STUDENT_NOTICE_VERSION)
    return reply({ error: "Please complete student onboarding first." }, 403);
  const recipient = process.env.STUDENT_COUNSELOR_EMAIL?.trim();
  const from = process.env.STUDENT_COUNSELOR_FROM?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    process.env.STUDENT_COUNSELOR_NOTIFICATIONS_ENABLED !== "true" ||
    membership.school_id !== process.env.STUDENT_COUNSELOR_SCHOOL_ID ||
    !school ||
    !recipient ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
    !from ||
    !apiKey ||
    !serviceKey
  ) {
    return reply(
      {
        error:
          "Counselor notifications are not connected yet. No email has been sent. Please contact your school directly.",
      },
      503,
    );
  }
  const { data: record, error } = await supabase.rpc(
    "student_create_counselor_request",
    { p_request_id: body.requestId },
  );
  if (error || !record?.id)
    return reply(
      {
        error:
          error?.code === "P0002"
            ? "Please wait two minutes before sending a new request."
            : "Your request could not be created. Please try again.",
      },
      error?.code === "P0002" ? 429 : 503,
    );
  if (record.status === "sent")
    return reply({ status: "sent", requestId: record.id });
  // Provider idempotency expires after 24h. Never replay an old unresolved request.
  if (Date.now() - Date.parse(record.created_at) > 23 * 3_600_000)
    return reply(
      {
        error:
          "This request needs a pilot coordinator to check its delivery status. Please contact your school directly.",
      },
      409,
    );
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const providerId = await deliverCounselorRequest(
      { apiKey, from, to: recipient },
      {
        id: record.id,
        displayName: record.display_name,
      },
    );
    const { error: saveError } = await admin
      .from("student_counselor_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: providerId,
      })
      .eq("id", record.id)
      .eq("user_id", user.id);
    if (saveError)
      return reply(
        {
          status: "pending",
          requestId: record.id,
          error:
            "The email service accepted your request, but its saved status is still pending. Please do not send a second request.",
        },
        202,
      );
    return reply({ status: "sent", requestId: record.id });
  } catch {
    await admin
      .from("student_counselor_requests")
      .update({ status: "failed" })
      .eq("id", record.id)
      .eq("user_id", user.id)
      .neq("status", "sent");
    // Never expose provider responses, recipient addresses, or student details in logs.
    return reply(
      {
        error:
          "We could not confirm that your request was sent. Retry this request or contact your school directly.",
        requestId: record.id,
      },
      502,
    );
  }
}
