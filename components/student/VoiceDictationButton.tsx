"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { dictationError, getSpeechConstructor, startDictation } from "@/lib/student/dictation";

export default function VoiceDictationButton({ value, onChange, language, disabled = false, onActiveChange }: { value: string; onChange: (value: string) => void; language: "en" | "es"; disabled?: boolean; onActiveChange: (active: boolean) => void }) {
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const session = useRef<ReturnType<typeof startDictation> | null>(null);
  const noticeId = useId();
  const t = (en: string, es: string) => language === "es" ? es : en;
  useEffect(() => () => { session.current?.cancel(); }, []);
  useEffect(() => { if (disabled) session.current?.stop(); }, [disabled]);
  useEffect(() => { session.current?.stop(); }, [language]);
  function start() {
    const Engine = getSpeechConstructor(window);
    if (!Engine) { setSupported(false); setNotice(true); return; }
    setNotice(false); setError(""); setAcknowledged(true);
    setListening(true); onActiveChange(true);
    try {
      session.current?.cancel();
      session.current = startDictation(Engine, {
        base: value, language, onText: onChange,
        onEnd: () => { setListening(false); onActiveChange(false); },
        onError: code => { setError(dictationError(code, language)); setNotice(true); },
      });
    } catch { setListening(false); onActiveChange(false); setError(dictationError("start", language)); setNotice(true); }
  }
  function toggle() {
    if (listening) { session.current?.stop(); return; }
    setSupported(Boolean(getSpeechConstructor(window))); setError("");
    if (acknowledged && getSpeechConstructor(window)) start(); else setNotice(true);
  }
  return <div className="voice-control">
    <button type="button" className={`voice-mic ${listening ? "listening" : ""}`} onClick={toggle} disabled={disabled && !listening} aria-label={listening ? t("Stop voice typing", "Detener dictado") : t("Voice to text", "Voz a texto")} title={listening ? t("Stop voice typing", "Detener dictado") : t("Voice to text", "Voz a texto")} aria-pressed={listening} aria-expanded={notice} aria-controls={noticeId}>{listening ? <Square size={17} aria-hidden /> : <Mic size={19} aria-hidden />}{listening && <span>{t("Stop", "Parar")}</span>}</button>
    <span className="sr-only" role="status">{listening ? t("Listening. Press Stop before editing or sending.", "Escuchando. Pulsa Parar antes de editar o enviar.") : ""}</span>
    {notice && <div className="voice-notice" id={noticeId} role="group" aria-label={t("Voice-to-text notice", "Aviso de dictado")}>
      <div><strong>{t("Voice to text", "Voz a texto")}</strong><button type="button" aria-label={t("Close voice notice", "Cerrar aviso")} onClick={() => setNotice(false)}><X size={18} /></button></div>
      {error && <p role="alert">{error}</p>}
      {!supported ? <p>{t("Voice typing is not available in this browser or may be blocked by your school. You can keep typing or use your device’s keyboard dictation.", "El dictado no está disponible en este navegador o tu escuela puede bloquearlo. Puedes escribir o usar el dictado del teclado de tu dispositivo.")}</p> : <>
        <p>{t("Your browser’s speech service may process your microphone audio. Arize does not receive or save an audio recording. Only text you choose to send enters Clarity chat.", "El servicio de voz de tu navegador puede procesar el audio del micrófono. Arize no recibe ni guarda una grabación. Solo el texto que decidas enviar entra al chat de Clarity.")}</p>
        <p>{t("Avoid names or private details. Speak for up to one minute, stop, review your text, then press Send. There are no spoken AI replies.", "Evita nombres o detalles privados. Habla hasta un minuto, detén el dictado, revisa el texto y pulsa Enviar. La IA no responderá en voz alta.")}</p>
        <button className="student-action" type="button" onClick={start} disabled={disabled}>{t("Continue to microphone", "Continuar al micrófono")}</button>
      </>}
      <button type="button" className="op-text-button" onClick={() => setNotice(false)}>{t("Keep typing instead", "Prefiero escribir")}</button>
    </div>}
  </div>;
}
