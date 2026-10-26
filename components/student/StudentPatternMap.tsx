"use client";
import { useEffect, useState } from "react";
import { dateKey, shiftDay } from "@/lib/student/features";
import { feelingLabel } from "@/lib/student/policy";
type CheckIn = { day: string; score: number };
export default function StudentPatternMap({
  preview,
  onBack,
}: {
  preview: boolean;
  onBack: () => void;
}) {
  const [range, setRange] = useState("30");
  const [data, setData] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (preview) return;
    fetch(
      `/api/student/features?view=patterns&days=${range}&offset=${offset}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted) {
          setData((old) =>
            offset ? [...old, ...body.checkIns] : body.checkIns,
          );
          setHasMore(body.hasMore);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Your Pattern Map could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, offset, preview, retry]);
  const rows = (
    preview
      ? Array.from({ length: range === "7" ? 7 : 12 }, (_, i) => ({
          day: shiftDay(dateKey(), -i),
          score: [7, 6, 8, 5, 6, 7, 4, 6, 8, 7, 6, 5][i],
        }))
      : data
  )
    .slice()
    .reverse();
  const average = rows.length
    ? rows.reduce((s, c) => s + c.score, 0) / rows.length
    : 0;
  const points = rows
    .map(
      (c, i) =>
        `${24 + (i / Math.max(1, rows.length - 1)) * 552},${160 - ((c.score - 1) / 9) * 132}`,
    )
    .join(" ");
  return (
    <div className="student-narrow">
      <button className="student-back" onClick={onBack}>
        ← Back to Goals
      </button>
      <div className="student-intro">
        <p className="student-edition-label">Your Pattern Map</p>
        <h1>Notice your rhythm.</h1>
        <p>
          Your own check-ins, at your own pace. Not a diagnosis or a scorecard.
        </p>
      </div>
      <div className="student-inline" aria-label="Pattern history range">
        {["7", "30", "90", "all"].map((value) => (
          <button
            key={value}
            className={`student-action ${range === value ? "secondary" : "plain"}`}
            aria-pressed={range === value}
            disabled={loading || range === value}
            onClick={() => {
              setRange(value);
              setOffset(0);
              setData([]);
              setError("");
              setLoading(!preview);
            }}
          >
            {value === "all" ? "All time" : `${value} days`}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="student-error">
          {error}
          <button
            className="student-action plain"
            onClick={() => {
              setError("");
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            Retry Pattern Map
          </button>
        </p>
      ) : null}
      <section className="student-card" style={{ marginTop: 24 }}>
        <h2>Your check-in landscape</h2>
        {loading ? (
          <p role="status">Loading check-ins…</p>
        ) : rows.length ? (
          <>
            <p>
              {rows.length} check-ins · Average {average.toFixed(1)}/10
            </p>
            <svg
              viewBox="0 0 600 190"
              className="student-pattern-chart"
              role="img"
              aria-label="Feeling scores over time. Exact values are listed below."
            >
              <text x="0" y="24">
                10
              </text>
              <text x="5" y="164">
                1
              </text>
              <line x1="24" y1="160" x2="580" y2="160" stroke="#cedaca" />
              <polyline
                fill="none"
                stroke="#2f7e50"
                strokeWidth="3"
                points={points}
              />
              {rows.map((c, i) => (
                <circle
                  key={c.day}
                  cx={24 + (i / Math.max(1, rows.length - 1)) * 552}
                  cy={160 - ((c.score - 1) / 9) * 132}
                  r="4"
                  fill="#2f7e50"
                />
              ))}
            </svg>
            <p>
              Higher and lower days both belong here. This chart does not
              explain why you felt a certain way.
            </p>
            <details className="student-pattern-values">
              <summary>Read exact check-in values</summary>
              <ul>
                {rows.map((c) => (
                  <li key={c.day}>
                    {c.day}: {feelingLabel(c.score)} · {c.score}/10
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p>
            No check-ins in this range yet. Your map will grow as you check in.
          </p>
        )}
        {hasMore ? (
          <button
            className="student-action plain"
            disabled={loading || Boolean(error)}
            onClick={() => {
              setLoading(true);
              setOffset((n) => n + 100);
            }}
          >
            Load older check-ins
          </button>
        ) : null}
      </section>
    </div>
  );
}
