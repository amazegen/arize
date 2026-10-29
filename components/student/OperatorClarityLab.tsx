"use client";
import { useState } from "react";
import { Send, MessageCircle, RotateCcw, ShieldCheck } from "lucide-react";
import type { OperatorConfig, TestMessage } from "@/lib/student/operator";
import { operatorTestBlock, requestOperatorTest } from "@/lib/student/operator-test-client";

export default function OperatorClarityLab({ config }: { config: OperatorConfig }) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("en");
  const [fictional, setFictional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enabled = config.aiEnabled && config.aiConfigured;
  const exhausted = messages.length >= 16;
  const blocked = operatorTestBlock({ busy, enabled, exhausted, fictional, content });
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (blocked) return;
    const next: TestMessage[] = [...messages, { role: "user", content: content.trim() }];
    setBusy(true); setError("");
    try {
      const reply = await requestOperatorTest({ messages: next, language, fictional });
      setMessages([...next, { role: "assistant", content: reply }]); setContent("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Test unavailable."); } finally { setBusy(false); }
  }
  return <div className="op-lab-layout"><section className="op-panel op-lab-chat"><div className="op-panel-heading"><div><h2><MessageCircle size={22} /> Clarity</h2><p>Live test · not a student conversation</p></div><button className="op-text-button" disabled={busy} onClick={() => { setMessages([]); setContent(""); setError(""); }}><RotateCcw size={16} /> New test</button></div>
    <div className="op-test-messages" role="log" aria-label="Fictional Clarity test conversation" aria-live="polite">{messages.length ? messages.map((m, i) => <div key={i} className={`op-test-message ${m.role}`}><span>{m.role === "user" ? "Your fictional scenario" : "Clarity"}</span><p>{m.content}</p></div>) : <div className="op-chat-welcome"><span className="op-empty-icon"><MessageCircle size={28} /></span><h3>Try a student’s perspective.</h3><p>Use a made-up situation to review Clarity’s tone, writing and safety boundaries.</p><div className="op-sample-prompts">{(language === "es" ? ["Me preocupa mi examen de matemáticas de mañana.", "Mi amigo quiere que responda mensajes toda la noche."] : ["I’m worried about my math test tomorrow.", "My friend expects me to text all night, but I need sleep."]).map(text => <button key={text} onClick={() => setContent(text)}>{text}</button>)}</div></div>}{busy && <p role="status">Clarity is responding…</p>}</div>
    {error && <p role="alert" className="student-error">{error}</p>}
    <form className="op-composer" onSubmit={send} aria-busy={busy}>
      <label className="student-check op-test-notice"><input type="checkbox" checked={fictional} onChange={e => setFictional(e.target.checked)} disabled={busy} />I’ll use fictional scenarios only—no student, client or session details.</label>
      <label className="sr-only" htmlFor="operator-test-message">Fictional message to Clarity</label>
      <textarea id="operator-test-message" value={content} onChange={e => setContent(e.target.value)} rows={3} maxLength={2000} placeholder={exhausted ? "Start a new test to continue." : "Write a fictional student message…"} disabled={busy || !enabled || exhausted} required aria-describedby="operator-send-help" />
      <p id="operator-send-help" className="op-send-help" role="status">{blocked ?? "Ready to send. This test is not saved in student history."}</p>
      <div><span>{content.length}/2,000</span><button className="student-action" disabled={blocked !== null} aria-describedby="operator-send-help"><Send size={17} /> {busy ? "Sending…" : "Send test"}</button></div>
    </form>
  </section><aside className="op-lab-options"><section className="op-panel"><h2>Test settings</h2><label className="op-field">Language<select value={language} onChange={e => { setLanguage(e.target.value); setMessages([]); setError(""); }} disabled={busy}><option value="en">English</option><option value="es">Español</option></select></label><dl className="op-settings-list"><div><dt>Model</dt><dd>{config.model ?? "Not configured"}</dd></div><div><dt>Writing version</dt><dd>{config.promptVersion}</dd></div><div><dt>Live testing</dt><dd>{enabled ? "Available" : "Not enabled in this environment"}</dd></div></dl></section><section className="op-panel"><ShieldCheck size={25} /><h3>A separate test space</h3><ul className="op-lab-rules"><li>Uses the existing student OpenAI account and incurs normal API usage.</li><li>Uses the student coach’s current prompt and input/output safety checks.</li><li>Eight turns per test; refresh or New test clears this local conversation.</li><li>No test messages saved in the Arize database, no enrollment and no counselor email.</li><li>This is prompt testing, not model training. OpenAI still processes the messages.</li></ul></section></aside></div>;
}
