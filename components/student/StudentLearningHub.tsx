"use client";

import { BookOpen, MessageCircle, UsersRound } from "lucide-react";
import { STUDENT_TOPICS } from "@/lib/student/learning";
import { safeCounselorUrl } from "@/lib/student/policy";
import { useStudentLanguage } from "./StudentLanguage";
import StudentBelonging from "./StudentBelonging";

export function StudentTopicStarters({
  onChoose,
  disabled = false,
}: {
  onChoose: (prompt: string) => void;
  disabled?: boolean;
}) {
  const { t, text } = useStudentLanguage();
  return (
    <details className="student-topic-starters">
      <summary>
        {t("Not sure where to start?", "¿No sabes por dónde empezar?")}
      </summary>
      <p>
        {t(
          "Choose a topic to draft a message. Nothing is sent until you press send.",
          "Elige un tema para preparar un mensaje. No se envía nada hasta que pulses enviar.",
        )}
      </p>
      <div className="student-topic-grid">
        {STUDENT_TOPICS.map((topic) => (
          <button
            key={topic.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(text(topic.prompt))}
          >
            {text(topic.label)}
          </button>
        ))}
      </div>
    </details>
  );
}
export default function StudentLearningHub({
  preview,
  onReset,
  onCoach,
}: {
  preview: boolean;
  onReset: () => void;
  onCoach: (prompt: string) => void;
}) {
  const { t } = useStudentLanguage();
  const ambassadorUrl = safeCounselorUrl(
    process.env.NEXT_PUBLIC_STUDENT_AMBASSADOR_URL,
  );
  return (
    <>
      <div className="student-intro">
        <p className="student-edition-label">
          {t(
            "Small tools. Real school days.",
            "Pequeñas herramientas para el día escolar.",
          )}
        </p>
        <h1>{t("Your school-day toolkit", "Herramientas para tu día")}</h1>
        <p>
          {t(
            "Take a pause, find words for what is happening, or help shape what comes next.",
            "Haz una pausa, encuentra palabras para lo que pasa o ayuda a dar forma a lo que viene.",
          )}
        </p>
      </div>
      <div className="student-stack">
        <section className="student-card student-tool-card">
          <BookOpen aria-hidden size={28} />
          <h2>{t("Class Reset", "Pausa de clase")}</h2>
          <p>
            {t(
              "Five minutes, guided by a teacher. No personal stories or answers are required. Also works as a quiet individual pause.",
              "Cinco minutos con la guía de tu docente. No se piden historias personales ni respuestas. También puedes hacer una pausa a solas.",
            )}
          </p>
          <button className="student-action" onClick={onReset}>
            {t("Choose a reset", "Elegir una pausa")}
          </button>
          <a
            href="/student/class-reset"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(
              "Open facilitator / classroom view",
              "Abrir vista para el grupo",
            )}
          </a>
        </section>
        <section className="student-card">
          <MessageCircle aria-hidden size={28} />
          <h2>
            {t(
              "Life does not fit in one subject.",
              "La vida no cabe en una sola materia.",
            )}
          </h2>
          <StudentTopicStarters onChoose={onCoach} />
        </section>
        <StudentBelonging preview={preview} />
        <section className="student-card">
          <UsersRound aria-hidden size={28} />
          <p className="student-edition-label">
            {t("Program planning", "Programa en preparación")}
          </p>
          <h2>
            {t(
              "Student Wellness Ambassadors",
              "Embajadores del bienestar estudiantil",
            )}
          </h2>
          <p>
            {t(
              "Students can help shape Arize, try new ideas, and invite peers to take part. Ambassadors are not counselors and do not see anyone’s chats, feelings, goals, or survey answers.",
              "Los estudiantes pueden ayudar a mejorar Arize, probar ideas e invitar a otros a participar. Los embajadores no son consejeros y no ven chats, emociones, metas ni respuestas de encuestas.",
            )}
          </p>
          <ul className="student-learning-list">
            <li>
              {t(
                "Share app feedback and ideas with a youth advisory group.",
                "Comparte ideas y comentarios sobre la aplicación en un grupo asesor juvenil.",
              )}
            </li>
            <li>
              {t(
                "Support inclusive outreach without asking peers to disclose personal information.",
                "Ayuda a invitar a todos sin pedir información personal a tus compañeros.",
              )}
            </li>
            <li>
              {t(
                "Your school must approve the program and any service-hour credit. Arize does not award or promise graduation credit.",
                "Tu escuela debe aprobar el programa y cualquier crédito por horas de servicio. Arize no otorga ni promete créditos de graduación.",
              )}
            </li>
          </ul>
          {ambassadorUrl ? (
            <a
              className="student-action secondary"
              href={ambassadorUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(
                "School-approved ambassador information",
                "Información del programa aprobada por la escuela",
              )}
            </a>
          ) : (
            <p className="student-note">
              {t(
                "Sign-up is not open yet. Ask your pilot coordinator about the planned program.",
                "La inscripción aún no está abierta. Consulta con quien coordina el piloto sobre el programa.",
              )}
            </p>
          )}
        </section>
        <section className="student-note">
          <h2>
            {t("About voice conversations", "Sobre las conversaciones por voz")}
          </h2>
          <p>
            {t(
              "Shelby’s AI voice is planned, but is not available yet. When approved and enabled, it will be clearly labeled as a synthetic voice—not a live conversation with Shelby. Text support stays available.",
              "La voz de IA de Shelby está prevista, pero aún no está disponible. Cuando se apruebe y active, se identificará como voz sintética, no como una conversación en vivo con Shelby. El apoyo por texto seguirá disponible.",
            )}
          </p>
        </section>
      </div>
    </>
  );
}
