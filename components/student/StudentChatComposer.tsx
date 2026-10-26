"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const canSend = !disabled && Boolean(value.trim());

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
          aria-label="Message Clarity"
          aria-describedby={hintId}
          placeholder="Message Clarity…"
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
          disabled={disabled}
        />
        <div className="student-composer-toolbar">
          <span className="student-composer-label">Clarity · AI coach</span>
          <button
            className="student-composer-send"
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            aria-busy={busy}
            title="Send message"
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
      <p id={hintId} className="student-composer-hint">
        Enter to send · Shift + Enter for a new line
      </p>
    </form>
  );
}
