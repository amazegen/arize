"use client";
import { useEffect, useState } from "react";
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
              : "Your history could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, preview, retry]);
  const visible = items.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      className="student-card student-history"
      aria-label="Your conversation history"
    >
      <h2>Your conversations</h2>
      <p>
        Reopen a saved chat to review it or continue. Only your student
        conversations appear here.
      </p>
      <label className="student-form">
        Find a loaded conversation
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversation titles"
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
            Retry history
          </button>
        </div>
      ) : null}
      {loading ? <p role="status">Loading conversations…</p> : null}
      {visible.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          disabled={disabled || loading || Boolean(error)}
        >
          <strong>{item.title}</strong>
          <br />
          <time dateTime={item.created_at}>
            {new Date(item.created_at).toLocaleDateString(undefined, {
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
            ? "No matches among loaded conversations."
            : "No saved conversations yet. Your chats will appear here after you use Clarity."}
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
          Load older conversations
        </button>
      ) : null}
    </section>
  );
}
