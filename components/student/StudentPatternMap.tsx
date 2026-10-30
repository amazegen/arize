"use client";
import { useEffect, useState } from "react";
import { dateKey, shiftDay } from "@/lib/student/features";
import { feelingLabel } from "@/lib/student/policy";
import { useStudentLanguage } from "./StudentLanguage";
import { patternDayPosition } from "@/lib/student/pattern-chart";
import { studentErrorText } from "@/lib/student/error-language";
type CheckIn = { day: string; score: number };
export default function StudentPatternMap({
  preview,
  onBack,
}: {
  preview: boolean;
  onBack: () => void;
}) {
  const { language, t } = useStudentLanguage();
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
              : t(
                  "Your Pattern Map could not be loaded.",
                  "No se pudo cargar tu mapa de ánimo.",
                ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, offset, preview, retry, t]);
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
      (c) =>
        `${patternDayPosition(c.day, rows[0].day, rows[rows.length - 1].day)},${160 - ((c.score - 1) / 9) * 132}`,
    )
    .join(" ");
  return (
    <div className="student-narrow">
      <button className="student-back" onClick={onBack}>
        {t("← Back to Goals", "← Volver a Metas")}{" "}
      </button>
      <div className="student-intro">
        <p className="student-edition-label">
          {t("Your Pattern Map", "Tu mapa de ánimo")}
        </p>
        <h1>{t("Notice your rhythm.", "Observa tu ritmo.")}</h1>
        <p>
          {t(
            "Your own check-ins, at your own pace. Not a diagnosis or a scorecard.",
            "Tus registros de ánimo, a tu ritmo. No es un diagnóstico ni una calificación.",
          )}{" "}
        </p>
      </div>
      <div
        className="student-inline"
        aria-label={t(
          "Pattern history range",
          "Período del historial de ánimo",
        )}
      >
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
            {value === "all"
              ? t("All time", "Todo el historial")
              : `${value} ${t("days", "días")}`}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="student-error">
          {studentErrorText(error, language)}
          <button
            className="student-action plain"
            onClick={() => {
              setError("");
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            {t("Retry Pattern Map", "Reintentar mapa de ánimo")}{" "}
          </button>
        </p>
      ) : null}
      <section className="student-card" style={{ marginTop: 24 }}>
        <h2>{t("Your check-in landscape", "Tu recorrido de ánimo")}</h2>
        {loading ? (
          <p role="status">
            {t("Loading check-ins…", "Cargando registros de ánimo…")}
          </p>
        ) : rows.length ? (
          <>
            <p>
              {rows.length} {t("check-ins · Average", "registros · Promedio")}{" "}
              {average.toFixed(1)}/10
            </p>
            <svg
              viewBox="0 0 600 190"
              className="student-pattern-chart"
              role="img"
              aria-label={t(
                "Feeling scores over time. Exact values are listed below.",
                "Puntuaciones de ánimo a lo largo del tiempo. Los valores exactos aparecen abajo.",
              )}
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
              {rows.map((c) => (
                <circle
                  key={c.day}
                  cx={patternDayPosition(c.day, rows[0].day, rows[rows.length - 1].day)}
                  cy={160 - ((c.score - 1) / 9) * 132}
                  r="4"
                  fill="#2f7e50"
                />
              ))}
              <text x="24" y="185" fontSize="12">{rows[0].day}</text><text x="576" y="185" textAnchor="end" fontSize="12">{rows[rows.length - 1].day}</text>
            </svg>
            <p className="staff-caption">{t("Dates are spaced by calendar day. Days without a check-in are not zero scores.", "Las fechas se separan por día del calendario. Los días sin registro no son puntuaciones de cero.")}</p>
            <p>
              {t(
                "Higher and lower days both belong here. This chart does not explain why you felt a certain way.",
                "Aquí caben los días altos y bajos. Este gráfico no explica por qué te sentiste de cierta manera.",
              )}{" "}
            </p>
            <details className="student-pattern-values">
              <summary>
                {t(
                  "Read exact check-in values",
                  "Leer los valores exactos de ánimo",
                )}
              </summary>
              <ul>
                {rows.map((c) => (
                  <li key={c.day}>
                    {c.day}: {feelingLabel(c.score, language)} · {c.score}/10
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p>
            {t(
              "No check-ins in this range yet. Your map will grow as you check in.",
              "Aún no hay registros en este período. Tu mapa crecerá con tus registros.",
            )}{" "}
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
            {t("Load older check-ins", "Cargar registros anteriores")}{" "}
          </button>
        ) : null}
      </section>
    </div>
  );
}
