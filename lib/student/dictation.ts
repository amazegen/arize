export type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
export type SpeechEngine = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
export type SpeechConstructor = new () => SpeechEngine;
export function getSpeechConstructor(value: unknown): SpeechConstructor | null {
  if (!value || typeof value !== "object") return null;
  const browser = value as { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}
export function dictationText(base: string, spoken: string, maxLength = 2000) {
  const words = spoken.trim();
  return (words ? `${base}${base && !/\s$/.test(base) ? " " : ""}${words}` : base).slice(0, maxLength);
}
export function dictationError(code: string, language: "en" | "es") {
  if (["not-allowed", "service-not-allowed"].includes(code)) return language === "es" ? "El micrófono o el dictado está bloqueado. Revisa los permisos de tu navegador o escuela, o escribe tu mensaje." : "Microphone or dictation access is blocked. Check your browser or school permissions, or type your message.";
  if (code === "no-speech") return language === "es" ? "No se detectó voz. Inténtalo otra vez o escribe tu mensaje." : "No speech was detected. Try again or type your message.";
  return language === "es" ? "El dictado no pudo continuar. Tu texto sigue aquí; puedes editarlo o escribir." : "Dictation could not continue. Your draft is still here; you can edit it or type.";
}
export function startDictation(Engine: SpeechConstructor, options: { base: string; language: "en" | "es"; onText: (text: string) => void; onEnd: () => void; onError: (code: string) => void; maxLength?: number; durationMs?: number }) {
  const recognition = new Engine();
  let cancelled = false;
  let ended = false;
  recognition.lang = options.language === "es" ? "es-US" : "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  const timer = setTimeout(() => recognition.stop(), options.durationMs ?? 60000);
  recognition.onresult = event => {
    if (cancelled || ended) return;
    const spoken = Array.from(event.results).map(result => result[0].transcript).join(" ");
    const text = dictationText(options.base, spoken, options.maxLength);
    options.onText(text);
    if (text.length >= (options.maxLength ?? 2000)) recognition.stop();
  };
  const finish = () => { if (ended) return; clearTimeout(timer); ended = true; if (!cancelled) options.onEnd(); };
  recognition.onerror = event => {
    if (!cancelled && event.error !== "aborted") options.onError(event.error);
    finish(); recognition.abort();
  };
  recognition.onend = finish;
  try { recognition.start(); } catch (error) { clearTimeout(timer); throw error; }
  return {
    stop: () => { if (!cancelled && !ended) recognition.stop(); },
    cancel: () => { cancelled = true; clearTimeout(timer); recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); },
  };
}
