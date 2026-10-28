"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  RESET_LESSONS,
  resetPosition,
  SEL_SKILLS,
} from "@/lib/student/learning";
import { useStudentLanguage } from "./StudentLanguage";

export default function StudentClassReset() {
  const { t, text } = useStudentLanguage();
  const [lessonId, setLessonId] = useState(RESET_LESSONS[0].id);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const anchor = useRef({ start: 0, elapsed: 0 });
  const lesson = RESET_LESSONS.find((item) => item.id === lessonId)!;
  const total = lesson.steps.reduce((sum, step) => sum + step.seconds, 0);
  const position = resetPosition(elapsed, lesson.steps);
  const step = lesson.steps[position.index];
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const next = Math.min(
        total,
        anchor.current.elapsed +
          (performance.now() - anchor.current.start) / 1000,
      );
      setElapsed(next);
      if (next >= total) setRunning(false);
    }, 250);
    return () => window.clearInterval(timer);
  }, [running, total]);
  function reset(nextId = lessonId) {
    setRunning(false);
    setElapsed(0);
    setLessonId(nextId);
    anchor.current = { start: 0, elapsed: 0 };
  }
  function toggle() {
    if (running) {
      setElapsed(
        Math.min(
          total,
          anchor.current.elapsed +
            (performance.now() - anchor.current.start) / 1000,
        ),
      );
      setRunning(false);
    } else {
      anchor.current = { start: performance.now(), elapsed };
      setRunning(true);
    }
  }
  return (
    <div className="student-reset">
      <div className="student-intro">
        <p className="student-edition-label">
          {t("Advisory period · 5 minutes", "Tutoría de grupo · 5 minutos")}
        </p>
        <h1>{t("Class Reset", "Pausa de clase")}</h1>
        <p>
          {t(
            "A teacher-led pause. Join quietly, adapt an activity, or pass.",
            "Una pausa guiada por tu docente. Participa en silencio, adapta una actividad o pasa.",
          )}
        </p>
      </div>
      <div className="student-note">
        <strong>{t("Facilitator note", "Nota para quien facilita")}</strong>
        <p>
          {t(
            "Read the instructions aloud. Do not ask students to share private feelings, close their eyes, or explain why they pass. This page records no participation, answers, or attendance.",
            "Lee las instrucciones en voz alta. No pidas que compartan emociones privadas, cierren los ojos ni expliquen por qué pasan. Esta página no registra participación, respuestas ni asistencia.",
          )}
        </p>
      </div>
      <label className="student-reset-select">
        {t("Choose an activity", "Elige una actividad")}
        <select value={lesson.id} onChange={(e) => reset(e.target.value)}>
          {RESET_LESSONS.map((item) => (
            <option value={item.id} key={item.id}>
              {text(item.title)}
            </option>
          ))}
        </select>
      </label>
      <section
        className="student-card student-reset-stage"
        aria-label={t("Current activity", "Actividad actual")}
      >
        <p className="student-edition-label">{text(lesson.title)}</p>
        <div
          role="timer"
          aria-label={t(
            "Time left in this step",
            "Tiempo que queda en este paso",
          )}
          className="student-reset-clock"
        >
          {position.done
            ? "✓"
            : `${Math.floor(position.remaining / 60)}:${String(position.remaining % 60).padStart(2, "0")}`}
        </div>
        <div
          aria-live="polite"
          aria-atomic="true"
          key={`${lesson.id}-${position.index}-${position.done}`}
        >
          <h2>
            {position.done
              ? t("Ready for your next step.", "Listos para el próximo paso.")
              : text(step.title)}
          </h2>
          <p>
            {position.done
              ? t(
                  "Thank you for making space. No one needs to share or turn anything in.",
                  "Gracias por hacer espacio. Nadie tiene que compartir ni entregar nada.",
                )
              : text(step.instruction)}
          </p>
        </div>
        <progress
          aria-label={t("Activity progress", "Progreso de la actividad")}
          value={elapsed}
          max={total}
        />
        <div className="student-inline">
          <button
            className="student-action"
            onClick={toggle}
            disabled={position.done}
          >
            {running ? (
              <Pause size={20} aria-hidden />
            ) : (
              <Play size={20} aria-hidden />
            )}
            {running
              ? t("Pause", "Pausar")
              : elapsed
                ? t("Continue", "Continuar")
                : t("Start 5-minute reset", "Iniciar pausa de 5 minutos")}
          </button>
          <button className="student-action plain" onClick={() => reset()}>
            <RotateCcw size={18} aria-hidden />
            {t("Start over", "Reiniciar")}
          </button>
        </div>
      </section>
      <details className="student-card" style={{ marginTop: 20 }}>
        <summary>
          {t(
            "Activity outline & CASEL skill mapping",
            "Pasos y habilidades de CASEL",
          )}
        </summary>
        <ol className="student-learning-list">
          {lesson.steps.map((item, index) => (
            <li key={index}>
              <strong>
                {text(item.title)} · 1 {t("minute", "minuto")}
              </strong>
              <p>{text(item.instruction)}</p>
              <span>{text(SEL_SKILLS[item.skill])}</span>
            </li>
          ))}
        </ol>
        <p>
          {t(
            "Original pilot activities mapped to CASEL’s five skill areas. Not CASEL-certified or endorsed. School content review is required before classroom use.",
            "Actividades originales del piloto relacionadas con las cinco áreas de CASEL. No cuentan con certificación ni aval de CASEL. La escuela debe revisar el contenido antes de usarlo en clase.",
          )}
        </p>
        <a
          href="https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Read the CASEL framework", "Leer el marco de CASEL")}
        </a>
      </details>
    </div>
  );
}
