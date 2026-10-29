"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useStudentLanguage } from "./StudentLanguage";
import VoiceDictationButton from "./VoiceDictationButton";

/** Presentation only: uses the existing chat submit handler and limits. */
export default function StudentChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const { t, language } = useStudentLanguage();
  const [dictating, setDictating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const canSend = !disabled && !dictating && Boolean(value.trim());

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <form className="student-chat-composer" onSubmit={onSubmit}>
      <div className="student-composer-box">
        <textarea
          ref={textareaRef}
          aria-label={t("Message Clarity", "Escribe a Clarity")}
          aria-describedby={hintId}
          placeholder={t("Message Clarity…", "Escribe a Clarity…")}
          enterKeyHint="send"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              if (canSend) event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={2000}
          rows={1}
          disabled={disabled || dictating}
        />
        <div className="student-composer-toolbar">
          <span className="student-composer-label">
            {t("Clarity · AI coach", "Clarity · guía de IA")}
          </span>
          <div className="student-composer-actions"><VoiceDictationButton value={value} onChange={onChange} language={language} disabled={disabled} onActiveChange={setDictating} /><button
            className="student-composer-send"
            type="submit"
            disabled={!canSend}
            aria-label={t("Send message", "Enviar mensaje")}
            aria-busy={busy}
            title={t("Send message", "Enviar mensaje")}
          >
            {busy ? (
              <LoaderCircle
                size={20}
                className="student-composer-spinner"
                aria-hidden
              />
            ) : (
              <ArrowUp size={22} strokeWidth={2.5} aria-hidden />
            )}
          </button>
          </div>
        </div>
      </div>
      <p id={hintId} className="student-composer-hint">
        {t(
          "Enter to send · Shift + Enter for a new line",
          "Enter para enviar · Mayús + Enter para una nueva línea",
        )}
      </p>
    </form>
  );
}
