import type { TestMessage } from "./operator.ts";

export function operatorTestBlock({ busy, enabled, exhausted, fictional, content }: { busy: boolean; enabled: boolean; exhausted: boolean; fictional: boolean; content: string }): string | null {
  if (busy) return "Sending your test. Clarity is responding…";
  if (!enabled) return "Live testing is not enabled in this environment.";
  if (exhausted) return "This test reached eight turns. Choose New test to continue.";
  if (!fictional) return "Check the fictional-scenarios notice above to enable Send test.";
  if (!content.trim()) return "Write a fictional message or choose an example above.";
  return null;
}

export async function requestOperatorTest(payload: { messages: TestMessage[]; language: string; fictional: boolean }, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45000);
  try {
    const response = await (options.fetcher ?? fetch)("/api/student/operator/coach", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Clarity could not respond. Your draft is still here.");
    if (typeof body.content !== "string" || !body.content.trim()) throw new Error("Clarity returned an empty reply. Your draft is still here; please try again.");
    return body.content;
  } catch (reason) {
    if (controller.signal.aborted) throw new Error("This test took too long. Your draft is still here. Please try again.");
    if (reason instanceof TypeError || reason instanceof SyntaxError) throw new Error("The test connection was interrupted. Your draft is still here. Please try again.");
    throw reason;
  } finally { clearTimeout(timer); }
}
