"use client";

import { useEffect, useState } from "react";
import { BELONGING_QUESTIONS } from "@/lib/student/learning";
import { BELONGING_NOTICE } from "@/lib/student/belonging";
import { useStudentLanguage } from "./StudentLanguage";
type Pulse = {
  week_of: string;
  welcome: number | null;
  trusted_adult: number | null;
  connection: number | null;
};
export default function StudentBelonging({ preview }: { preview: boolean }) {
  const { language, t, text } = useStudentLanguage();
  const [enabled, setEnabled] = useState(preview);
  const [loading, setLoading] = useState(!preview);
  const [history, setHistory] = useState<Pulse[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({
    welcome: "",
    trusted_adult: "",
    connection: "",
  });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch("/api/student/belonging", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error("unavailable");
        if (!controller.signal.aborted) {
          setEnabled(body.enabled);
          setHistory(body.history ?? []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            t(
              "The survey could not be loaded. You can skip it.",
              "No se pudo cargar la encuesta. Puedes omitirla.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [preview, refresh, t]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const values = Object.fromEntries(
        Object.entries(scores).map(([key, value]) => [
          key,
          value ? Number(value) : null,
        ]),
      );
      if (!preview) {
        const response = await fetch("/api/student/belonging", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            language,
            acknowledged: ack,
            noticeVersion: BELONGING_NOTICE,
          }),
        });
        if (!response.ok) throw new Error("save failed");
      }
      setMessage(
        preview
          ? t(
              "Preview only. Nothing was saved or shared.",
              "Solo es una vista previa. No se guardó ni compartió nada.",
            )
          : t(
              "Your private response is saved for this week. You may update it.",
              "Tu respuesta privada se guardó para esta semana. Puedes actualizarla.",
            ),
      );
      if (!preview) setRefresh((n) => n + 1);
    } catch {
      setError(
        t(
          "We could not save your response. You can skip this survey.",
          "No pudimos guardar tu respuesta. Puedes omitir esta encuesta.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="student-card" id="student-belonging">
      <p className="student-edition-label">
        {t("Optional reflection", "Reflexión opcional")}
      </p>
      <h2>{t("Do you feel connected?", "¿Sientes una conexión?")}</h2>
      <p>
        {t(
          "This is not a test or a diagnosis. You can skip any question or the whole survey. It does not affect your access to Arize.",
          "Esto no es un examen ni un diagnóstico. Puedes omitir cualquier pregunta o toda la encuesta. No afecta tu acceso a Arize.",
        )}
      </p>
      <div className="student-note" style={{ margin: "18px 0" }}>
        <p>
          {t(
            "Optional: your answers are saved for your own review. With school authorization, your latest response in a completed month may contribute to protected group counts shown to school administrators. Small groups are withheld. Teachers and counselors do not receive your individual answers, and answers are not linked to attendance or chats. Older answers saved under the private-only notice are excluded from this reporting. This is not emergency monitoring.",
            "Opcional: tus respuestas se guardan para que las revises. Con autorización escolar, tu última respuesta de un mes terminado puede contribuir a conteos grupales protegidos para la administración escolar. Se ocultan los grupos pequeños. Docentes y consejeros no reciben respuestas individuales y no se vinculan con asistencia ni chats. Las respuestas anteriores guardadas bajo el aviso de uso privado se excluyen de estos informes. Esto no es vigilancia de emergencias.",
          )}
        </p>
      </div>
      {loading ? (
        <p role="status">
          {t("Checking survey availability…", "Consultando la encuesta…")}
        </p>
      ) : !enabled ? (
        <p>
          {t(
            "Your school has not enabled this survey yet. No answers are collected.",
            "Tu escuela aún no ha activado esta encuesta. No se recopilan respuestas.",
          )}
        </p>
      ) : (
        <form className="student-form" onSubmit={save}>
          {BELONGING_QUESTIONS.map((question) => (
            <label key={question.id}>
              {text(question.text)}
              <select
                value={scores[question.id]}
                onChange={(event) =>
                  setScores((old) => ({
                    ...old,
                    [question.id]: event.target.value,
                  }))
                }
              >
                <option value="">
                  {t("Skip this question", "Omitir esta pregunta")}
                </option>
                {[1, 2, 3, 4, 5].map((score) => (
                  <option value={score} key={score}>
                    {score} —{" "}
                    {score === 1
                      ? t("Not at all true", "Nada cierto")
                      : score === 2
                        ? t("A little true", "Un poco cierto")
                        : score === 3
                          ? t("Somewhat true", "Algo cierto")
                          : score === 4
                            ? t("Mostly true", "Casi siempre cierto")
                            : t("Very true", "Muy cierto")}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="student-checkbox">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              required
            />
            <span>
              {t(
                "I read how this optional survey is used and choose to save my answers.",
                "Leí cómo se usa esta encuesta opcional y elijo guardar mis respuestas.",
              )}
            </span>
          </label>
          <button
            className="student-action secondary"
            disabled={busy || !ack || !Object.values(scores).some(Boolean)}
          >
            {busy
              ? t("Saving…", "Guardando…")
              : t("Save my response", "Guardar mi respuesta")}
          </button>
        </form>
      )}
      {error ? (
        <p className="student-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="student-success" role="status">
          {message}
        </p>
      ) : null}
      {history.length ? (
        <details style={{ marginTop: 20 }}>
          <summary>
            {t("My previous responses", "Mis respuestas anteriores")}
          </summary>
          <ul className="student-learning-list">
            {history.map((item) => (
              <li key={item.week_of}>
                <strong>
                  {t("Week of", "Semana del")} {item.week_of}
                </strong>
                {BELONGING_QUESTIONS.map((q) => (
                  <p key={q.id}>
                    {text(q.text)}{" "}
                    {item[q.id] === null
                      ? t("Skipped", "Omitida")
                      : `${item[q.id]}/5`}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
