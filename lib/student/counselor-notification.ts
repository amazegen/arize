export type CounselorNotificationConfig = {
  apiKey: string;
  from: string;
  to: string;
};
export type CounselorRequestSummary = {
  id: string;
  displayName: string;
};

// Explicit allowlist: no free-form student text, email, chats, goals, or scores.
export function counselorEmailText(request: CounselorRequestSummary) {
  return `A student has asked to connect with their school counselor.\n\nPreferred name: ${request.displayName}\nRequest reference: ${request.id}\n\nPlease follow your school's established student-contact process. No conversations, goals, or check-in scores are included. This is a student-initiated request, not a monitored emergency alert.`;
}

export async function deliverCounselorRequest(
  config: CounselorNotificationConfig,
  request: CounselorRequestSummary,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `arize-student-counselor/${request.id}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: "Arize: a student requested a counselor check-in",
      text: counselorEmailText(request),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data: unknown = await response.json();
  if (
    !response.ok ||
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof data.id !== "string" ||
    !data.id
  )
    throw Object.assign(new Error("Counselor notification was not accepted"), {
      // Status-only diagnostics; never attach the provider body or recipient.
      status: response.status,
    });
  return data.id;
}
