import type { TestMessage } from "./operator.ts";

export function operatorTestBlock({ busy, enabled, exhausted, fictional, content, dictating = false }: { busy: boolean; enabled: boolean; exhausted: boolean; fictional: boolean; content: string; dictating?: boolean }): string | null {
  if (busy) return "Sending your test. Clarity is responding…";
  if (dictating) return "Listening. Press Stop, review your text, then send.";
  if (!enabled) return "Live testing is not enabled in this environment.";
  if (exhausted) return "This test reached eight turns. Choose New test to continue.";
  if (!fictional) return "Check the fictional-scenarios notice above to enable Send test.";
  if (!content.trim()) return "Write or dictate a fictional message to enable Send test.";
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
