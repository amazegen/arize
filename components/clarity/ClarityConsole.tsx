"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CONFIG_FIELDS, DEFAULT_CONFIG, FIELD_LABELS, validateConfig, type ClarityConfig, type ClarityEdition, type ConsoleState } from "@/lib/clarity/config";
import styles from "./console.module.css";
type Message = { role: "user" | "assistant"; content: string };
export default function ClarityConsole({ edition, initial }: { edition: ClarityEdition; initial: ConsoleState }) {
  const endpoint = edition === "student" ? "/api/student/operator/clarity" : "/api/admin/clarity";
  const [state, setState] = useState(initial);
  const published = initial.published;
  const [config, setConfig] = useState<ClarityConfig>(published?.config ?? DEFAULT_CONFIG[edition]);
  const [savedId, setSavedId] = useState<string | null>(published?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [fictional, setFictional] = useState(false);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [tested, setTested] = useState(false);
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { const element = chat.current; element?.scrollTo({ top: element.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(field: keyof ClarityConfig, value: string) {
    setConfig(current => ({ ...current, [field]: value })); setSavedId(null); setDirty(true); setTested(false); setMessages([]); setNotice("");
  }
  async function call(path: string, body?: unknown) {
    const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The request could not finish.");
    return result;
  }
  async function change(action: "save" | "publish" | "restore", version?: string) {
    if (action === "publish" && (!savedId || !tested || dirty)) return;
    if (action === "save") { const valid = validateConfig(config); if (!valid.ok) { setError(valid.error); return; } }
    if (action === "restore" && !window.confirm("Restore this version as a new publication? Locked safety rules remain unchanged.")) return;
    setBusy(action); setError(""); setNotice("");
    try {
      const result = await call(endpoint, { action, config, note: action === "restore" ? "Restored an earlier configuration" : note, version: version ?? savedId, expected: state.active });
      // The mutation is already committed. Do not suggest retrying it if refresh fails.
      if (action === "save") { setSavedId(result.version); setDirty(false); }
      try {
        const next = await call(endpoint) as ConsoleState; setState(next);
        if (action === "restore") { const restored = next.versions.find(v => v.id === result.version); if (restored) setConfig(restored.config); setSavedId(result.version); setDirty(false); setTested(false); setMessages([]); }
        setNotice(action === "save" ? "Draft saved. Preview it, then publish when ready." : action === "restore" ? "Earlier settings restored as a new version. History is preserved." : "Published. New conversations and subsequent replies use these settings.");
      } catch { setNotice("Your change was saved, but history could not refresh. Reload before making another change."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); }
    finally { setBusy(""); }
  }
  async function preview(event: React.FormEvent) {
    event.preventDefault(); if (busy || !input.trim() || !fictional) return;
    const next: Message[] = [...messages, { role: "user", content: input.trim() }];
    if (next.length > 8) { setError("Start a new preview after four exchanges."); return; }
    setMessages(next); setInput(""); setBusy("preview"); setError("");
    try { const result = await call(`${endpoint}/preview`, { config, messages: next, fictional: true, language, requestId: crypto.randomUUID() }); setMessages([...next, { role: "assistant", content: result.content }]); setTested(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Preview failed."); setMessages(messages); setInput(next.at(-1)?.content ?? ""); }
    finally { setBusy(""); }
  }
  function loadVersion(id: string) {
    if (dirty && !window.confirm("Discard unsaved edits and open this version?")) return;
    const version = state.versions.find(item => item.id === id); if (!version) return;
    setConfig(version.config); setSavedId(id); setDirty(false); setTested(false); setMessages([]); setNotice("Version loaded for editing and preview. It has not been published.");
  }
  return <main className={styles.console}>
    <header className={styles.header}><Link href={edition === "student" ? "/student/operator?view=clarity" : "/settings"}>← Back to {edition === "student" ? "project workspace" : "profile"}</Link><span className={styles.badge}>{edition === "student" ? "Student Edition" : "Adult app"} · Admin only</span></header>
    <div className={styles.title}><p>ARIZE · CLARITY</p><h1>Shape the conversation.</h1><p>Draft, test and publish the coach’s writing style. Only this edition changes.</p></div>
    <aside className={styles.safety}><strong>Safety stays locked.</strong><p>Input and output moderation, self-harm and sexual-content safeguards, 988/911 guidance, AI identity and privacy rules cannot be edited here. {edition === "student" ? "Counselor requests remain a separate student-initiated action—not automatic alerts." : "This is not a monitored emergency service."} Writing guidance is not voice cloning or model training.</p></aside>
    <div role="status" aria-live="polite">{notice}</div>{error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="config-title"><h2 id="config-title">Coach configuration</h2><p>Changes stay private drafts until published. No keys or safety settings are editable.</p>
        <fieldset disabled={Boolean(busy)} className={styles.fields}>{CONFIG_FIELDS.map(field => <label key={field} htmlFor={`config-${field}`}>{FIELD_LABELS[field]}<textarea id={`config-${field}`} rows={field === "instructions" ? 4 : 3} value={config[field]} maxLength={2000} onChange={event => edit(field, event.target.value)} /><small>{config[field].length}/2,000 characters{field === "responseBoundaries" ? " · Additional limits only; cannot relax locked rules." : ""}</small></label>)}
          <label htmlFor="change-note">Change note<input id="change-note" maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="What changed and why?" /></label>
        </fieldset>
        <div className={styles.actions}><button disabled={Boolean(busy) || !note.trim()} onClick={() => change("save")}>{busy === "save" ? "Saving…" : "Save draft"}</button><button className={styles.primary} disabled={Boolean(busy) || !savedId || savedId === state.active || dirty || !tested} onClick={() => change("publish")}>{busy === "publish" ? "Publishing…" : "Publish tested draft"}</button></div>
        <small>Save a draft and run a fictional preview before publishing. Preview checks are not a guarantee of every real-world response.</small>
      </section>
      <section className={styles.panel} aria-labelledby="preview-title"><h2 id="preview-title">Try it before publishing</h2><p>Uses this draft and this app’s existing AI connection. No student records are opened. Preview messages are not saved to history or reports.</p>
        <label className={styles.check}><input type="checkbox" checked={fictional} disabled={Boolean(busy)} onChange={event => setFictional(event.target.checked)} />I’m using fictional examples, not private student information.</label>
        <label htmlFor="preview-language">Preview language<select id="preview-language" value={language} disabled={Boolean(busy)} onChange={event => { setLanguage(event.target.value as "en" | "es"); setMessages([]); setTested(false); }}><option value="en">English</option><option value="es">Español</option></select></label>
        <div ref={chat} className={styles.chat} role="log" aria-label="Fictional preview conversation" aria-live="polite">{messages.length ? messages.map((message, index) => <div key={index} className={message.role === "user" ? styles.user : styles.assistant}><strong>{message.role === "user" ? "You" : "Clarity"}</strong><p>{message.content}</p></div>) : <p className={styles.placeholder}>Try a fictional workplace or school scenario. Then test safety cases before launch.</p>}{busy === "preview" ? <p role="status">Clarity is checking and preparing a reply…</p> : null}</div>
        <form onSubmit={preview}><label htmlFor="preview-input">Message<textarea id="preview-input" value={input} maxLength={2000} rows={3} disabled={Boolean(busy)} onChange={event => setInput(event.target.value)} placeholder="I have a big test tomorrow and I can’t focus…" /></label><div className={styles.actions}><button type="button" disabled={Boolean(busy)} onClick={() => { setMessages([]); setTested(false); }}>New preview</button><button className={styles.primary} disabled={Boolean(busy) || !fictional || !input.trim() || messages.length >= 8}>Send test</button></div></form>
        <small>Limited to 5 tests/minute and 100/day per administrator. Provider processing still applies.</small>
      </section>
    </div>
    <section className={styles.panel}><div className={styles.actions}><h2>Version history</h2><button disabled={Boolean(busy)} onClick={async () => { setBusy("reload"); try { setState(await call(endpoint)); setNotice("History refreshed. Your editor draft is unchanged."); } catch { setError("History could not refresh."); } finally { setBusy(""); } }}>Refresh history</button></div><p>Current publication: {state.active ? state.active.slice(0, 8) : "Built-in defaults"}. Restoring creates a new version; it never erases the audit record.</p>
      {state.versions.length ? <div className={styles.history}>{state.versions.map(version => <article key={version.id}><div><strong>{version.id.slice(0, 8)} {version.id === state.active ? "· Published" : ""}</strong><p>{version.note}</p><small>{version.actor_email} · <time dateTime={version.created_at}>{new Date(version.created_at).toLocaleString()}</time></small><small>Changed: {version.changed_fields.map(field => FIELD_LABELS[field as keyof ClarityConfig] ?? field).join(", ") || "No writing fields changed"}{version.restored_from ? ` · Restored from ${version.restored_from.slice(0, 8)}` : ""}</small></div><div className={styles.actions}><button disabled={Boolean(busy)} onClick={() => loadVersion(version.id)}>Open draft</button><button disabled={Boolean(busy) || version.id === state.active} onClick={() => change("restore", version.id)}>Restore & publish</button></div></article>)}</div> : <p>No saved versions yet. Start from the reviewed built-in settings above.</p>}
      <div className={styles.actions}><button disabled={Boolean(busy) || state.page === 0} onClick={async () => { setBusy("history"); try { setState(await call(`${endpoint}?page=${state.page - 1}`)); } catch { setError("History could not load."); } finally { setBusy(""); } }}>Newer versions</button><span>Page {state.page + 1}</span><button disabled={Boolean(busy) || !state.hasMore} onClick={async () => { setBusy("history"); try { setState(await call(`${endpoint}?page=${state.page + 1}`)); } catch { setError("History could not load."); } finally { setBusy(""); } }}>Older versions</button></div>
      <details><summary>Recent publication audit (latest 100 events)</summary>{state.audit.map((event, index) => <p key={index}>{event.action} · {event.version_id.slice(0, 8)} · {event.actor_email} · {new Date(event.created_at).toLocaleString()}</p>)}</details>
    </section>
  </main>;
}
