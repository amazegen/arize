"use client";
import { useEffect, useState } from "react";
import { useStudentLanguage } from "./StudentLanguage";
type Conversation = { id: string; title: string; created_at: string };
export const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "sample-conversation-1",
    title: "Making room for a busy school week",
    created_at: "2026-10-25T17:00:00Z",
  },
  {
    id: "sample-conversation-2",
    title: "Preparing for a conversation with a friend",
    created_at: "2026-10-23T16:30:00Z",
  },
];
export default function StudentHistory({
  preview,
  onOpen,
  disabled,
}: {
  preview: boolean;
  onOpen: (id: string) => void;
  disabled: boolean;
}) {
  const { language, t } = useStudentLanguage();
  const [items, setItems] = useState<Conversation[]>(
    preview ? SAMPLE_CONVERSATIONS : [],
  );
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch(`/api/student/history?offset=${offset}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted) {
          setItems((old) =>
            offset
              ? Array.from(
                  new Map(
                    [...old, ...body.conversations].map((c: Conversation) => [
                      c.id,
                      c,
                    ]),
                  ).values(),
                )
              : body.conversations,
          );
          setHasMore(body.hasMore);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : t(
                  "Your history could not be loaded.",
                  "No se pudo cargar tu historial.",
                ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, preview, retry, t]);
  const visible = items.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      className="student-card student-history"
      aria-label={t(
        "Your conversation history",
        "Tu historial de conversaciones",
      )}
    >
      <h2>{t("Your conversations", "Tus conversaciones")}</h2>
      <p>
        {t(
          "Reopen a saved chat to review it or continue. Only your student conversations appear here.",
          "Abre un chat guardado para revisarlo o continuar. Aquí solo aparecen tus conversaciones de la edición estudiantil.",
        )}{" "}
      </p>
      <label className="student-form">
        {t(
          "Find a loaded conversation",
          "Busca en las conversaciones cargadas",
        )}{" "}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(
            "Search conversation titles",
            "Buscar títulos de conversaciones",
          )}
        />
      </label>
      {error ? (
        <div role="alert" className="student-error">
          {error}
          <button
            className="student-action plain"
            onClick={() => {
              setError("");
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            {t("Retry history", "Reintentar historial")}{" "}
          </button>
        </div>
      ) : null}
      {loading ? (
        <p role="status">
          {t("Loading conversations…", "Cargando conversaciones…")}
        </p>
      ) : null}
      {visible.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          disabled={disabled || loading || Boolean(error)}
        >
          <strong>{item.title}</strong>
          <br />
          <time dateTime={item.created_at}>
            {new Date(item.created_at).toLocaleDateString(language, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </button>
      ))}
      {!loading && !visible.length ? (
        <p>
          {items.length
            ? t(
                "No matches among loaded conversations.",
                "No hay coincidencias en las conversaciones cargadas.",
              )
            : t(
                "No saved conversations yet. Your chats will appear here after you use Clarity.",
                "Aún no hay conversaciones guardadas. Tus chats aparecerán aquí después de usar Clarity.",
              )}
        </p>
      ) : null}
      {hasMore ? (
        <button
          className="student-action plain"
          disabled={disabled || loading || Boolean(error)}
          onClick={() => {
            setError("");
            setLoading(true);
            setOffset((n) => n + 20);
          }}
        >
          {t(
            "Load older conversations",
            "Cargar conversaciones anteriores",
          )}{" "}
        </button>
      ) : null}
    </section>
  );
}
