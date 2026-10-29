"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, History, Sparkles, Sun, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  feelingLabel,
  safeCounselorUrl,
  STUDENT_GRADES,
  STUDENT_NOTICE_VERSION,
} from "@/lib/student/policy";
import {
  StudentSafety,
  StudentShell,
  type StudentScreen,
} from "./StudentShell";
import StudentGoals from "./StudentGoals";
import StudentHistory, { SAMPLE_CONVERSATIONS } from "./StudentHistory";
import StudentChatComposer from "./StudentChatComposer";
import useChatScroll from "./useChatScroll";
import { getUsernameError, normalizeUsername } from "@/lib/profile/username";
import { StudentLanguageProvider, useStudentLanguage } from "./StudentLanguage";
import StudentLearningHub, { StudentTopicStarters } from "./StudentLearningHub";
import StudentClassReset from "./StudentClassReset";

type Profile = {
  display_name: string;
  username?: string | null;
  grade: string;
  notice_version: string;
};
type School = {
  name: string;
  counselor_url: string | null;
  counselor_instructions: string;
};
type Goal = { id: string; title: string; is_complete: boolean; day: string };
type Message = { id?: string; role: "user" | "assistant"; content: string };
type Activity = {
  checkIn: { score: number; day: string } | null;
  goals: Goal[];
  conversations: { id: string; title: string; created_at: string }[];
};

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function StudentWorkspace(
  props: Parameters<typeof StudentWorkspaceContent>[0],
) {
  return (
    <StudentLanguageProvider>
      <StudentWorkspaceContent {...props} />
    </StudentLanguageProvider>
  );
}

function StudentWorkspaceContent({
  initialProfile,
  school,
  preview = false,
  initialScreen = "home",
  firstUse = false,
  loadingPreview = false,
}: {
  initialProfile: Profile | null;
  school: School;
  preview?: boolean;
  initialScreen?: StudentScreen;
  firstUse?: boolean;
  loadingPreview?: boolean;
}) {
  const { language, t } = useStudentLanguage();
  const router = useRouter();
  const screen = initialScreen;
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(
    initialProfile?.display_name ?? "",
  );
  const [grade, setGrade] = useState(initialProfile?.grade ?? "");
  const [username, setUsername] = useState(initialProfile?.username ?? "");
  const [acknowledged, setAcknowledged] = useState(
    initialProfile?.notice_version === STUDENT_NOTICE_VERSION,
  );
  const [day, setDay] = useState(localDay);
  const [score, setScore] = useState(6);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const sendingMessage = useRef(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [conversationOffset, setConversationOffset] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const { threadRef, composerRef, followNextMessage, jumpToLatest, hasNewMessage } = useChatScroll(`${conversationId}:${messages.length}:${pendingMessage !== null}:${busy}`, "page", screen === "clarity" && !showHistory);
  const [reload, setReload] = useState(0);
  const [counselorStatus, setCounselorStatus] = useState<
    "idle" | "sending" | "sent" | "pending" | "preview"
  >("idle");
  const [counselorError, setCounselorError] = useState("");
  const counselorRequestId = useRef<string | null>(null);
  const [previewDays, setPreviewDays] = useState<Record<string, Activity>>({});
  const [activity, setActivity] = useState<Activity | null>(
    preview && !loadingPreview
      ? {
          checkIn: firstUse ? null : { score: 7, day: localDay() },
          goals: firstUse
            ? []
            : [
                {
                  id: "sample-goal",
                  title: "Take a short break after class",
                  is_complete: false,
                  day: localDay(),
                },
              ],
          conversations: [],
        }
      : null,
  );

  useEffect(() => {
    if (preview || !profile) return;
    const controller = new AbortController();
    fetch(`/api/student?day=${day}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Your activity could not be loaded.");
        if (!controller.signal.aborted) setActivity(body);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : t(
                  "Your activity could not be loaded.",
                  "No se pudo cargar tu actividad.",
                ),
          );
      });
    return () => controller.abort();
  }, [day, preview, profile, reload, t]);

  function chooseDay(next: string) {
    if (next === day) return;
    if (preview) {
      setPreviewDays((old) => ({
        ...old,
        [day]: activity ?? { checkIn: null, goals: [], conversations: [] },
      }));
      setActivity(
        previewDays[next] ?? { checkIn: null, goals: [], conversations: [] },
      );
    } else setActivity(null);
    setDay(next);
  }
  function navigate(next: StudentScreen) {
    if (busy) return;
    setError("");
    setSuccess("");
    if (next === "check-in") setScore(activity?.checkIn?.score ?? 6);
    if (next === "home" || next === "check-in") chooseDay(localDay());
    const query = preview
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    query.set("screen", next);
    router.push(`${preview ? "/student-design" : "/student"}?${query}`, {
      scroll: true,
    });
  }
  async function requestCounselor() {
    if (counselorStatus === "sending" || counselorStatus === "sent") return;
    navigate("counselor");
    setCounselorError("");
    if (preview) {
      setCounselorStatus("preview");
      return;
    }
    setCounselorStatus("sending");
    counselorRequestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/student/counselor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: counselorRequestId.current }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Your request could not be sent.");
      if (result.status === "sent") setCounselorStatus("sent");
      else {
        setCounselorStatus("pending");
        setCounselorError(
          result.error ||
            "Your request status is pending. Please do not send a second request.",
        );
      }
    } catch (reason) {
      setCounselorStatus("idle");
      setCounselorError(
        reason instanceof Error
          ? reason.message
          : t(
              "We could not confirm that your request was sent. Please try again.",
              "No pudimos confirmar el envío de tu solicitud. Inténtalo de nuevo.",
            ),
      );
    }
  }
  async function mutate(body: Record<string, unknown>) {
    const response = await fetch("/api/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || "This could not be saved. Please try again.",
      );
    return data;
  }
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const usernameError = getUsernameError(username);
      if (usernameError) throw new Error(usernameError);
      if (!displayName.trim() || displayName.trim().length > 50)
        throw new Error(
          t(
            "Choose a name between 1 and 50 characters.",
            "Elige un nombre de 1 a 50 caracteres.",
          ),
        );
      const next = preview
        ? {
            profile: {
              display_name: displayName.trim(),
              username: normalizeUsername(username) || null,
              grade,
              notice_version: STUDENT_NOTICE_VERSION,
            },
          }
        : await mutate({
            action: "profile",
            displayName,
            username,
            grade,
            acknowledged,
          });
      setProfile(next.profile);
      setSuccess(
        preview
          ? t(
              "Profile updated in this preview only. No account was changed.",
              "El perfil solo se actualizó en esta vista previa. No se cambió ninguna cuenta.",
            )
          : t("Your profile is saved.", "Tu perfil está guardado."),
      );
      setReload((n) => n + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t(
              "Your profile could not be saved.",
              "No se pudo guardar tu perfil.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!preview)
        await mutate({ action: "check-in", day: localDay(), score });
      setActivity((old) => ({
        checkIn: { score, day: localDay() },
        goals: old?.goals ?? [],
        conversations: old?.conversations ?? [],
      }));
      setSuccess(
        t(
          "Check-in saved. Thanks for taking a moment for yourself.",
          "Registro guardado. Gracias por darte un momento.",
        ),
      );
      setReload((n) => n + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t(
              "Your check-in could not be saved.",
              "No se pudo guardar tu registro de ánimo.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadConversation(id: string, offset = 0) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (preview) {
        const sample = SAMPLE_CONVERSATIONS.find((c) => c.id === id);
        if (!sample) throw new Error("Preview conversation not found.");
        setMessages([
          { role: "user", content: sample.title },
          {
            role: "assistant",
            content:
              "This is a sample saved conversation. In the connected app, this is where you can review your own messages and continue the conversation.",
          },
        ]);
        setConversationId(id);
        setConversationHasMore(false);
        setConversationOffset(0);
        setShowHistory(false);
        return;
      }
      const response = await fetch(
        `/api/student/history?conversation=${encodeURIComponent(id)}&offset=${offset}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessages((old) =>
        offset
          ? Array.from(
              new Map(
                [...old, ...result.messages].map((m: Message) => [m.id, m]),
              ).values(),
            )
          : result.messages,
      );
      setConversationHasMore(result.hasMore);
      setConversationOffset(result.nextOffset);
      setConversationId(id);
      setShowHistory(false);
    } catch {
      setError(
        t(
          "Your conversation could not be loaded. Please try again.",
          "No se pudo cargar tu conversación. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy || sendingMessage.current) return;
    if (preview) {
      setError(
        t(
          "This is a design preview. No messages are sent to AI or saved.",
          "Esta es una vista de diseño. No se envían mensajes a la IA ni se guardan.",
        ),
      );
      return;
    }
    const content = draft.trim();
    sendingMessage.current = true;
    followNextMessage();
    let saved = false;
    setPendingMessage(content);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/student/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversationId, language }),
        signal: AbortSignal.timeout(60000),
      });
      const result = await response.json();
      if (result.conversationId) {
        saved = true;
        setConversationId(result.conversationId);
        setReload((n) => n + 1);
      }
      if (!response.ok) {
        // A stored turn is not sent again silently after a provider failure.
        if (result.conversationId) {
          setMessages((old) => [...old, { role: "user", content }]);
          setDraft("");
        }
        throw new Error(
          result.error || "Clarity could not reply. Please try later.",
        );
      }
      setMessages((old) => [...old, { role: "user", content }, result.message]);
      setDraft("");
    } catch (reason) {
      if (!saved) setDraft(content);
      setError(
        reason instanceof Error && ["TimeoutError", "AbortError", "TypeError", "SyntaxError"].includes(reason.name)
          ? t("We could not confirm the reply. Check your conversation history before sending again; your message may already have been saved.", "No pudimos confirmar la respuesta. Revisa tu historial antes de volver a enviar; es posible que tu mensaje ya se haya guardado.")
          : reason instanceof Error
          ? reason.message
          : t(
              "Clarity is unavailable right now. Please try later.",
              "Clarity no está disponible ahora. Inténtalo más tarde.",
            ),
      );
    } finally {
      setPendingMessage(null);
      sendingMessage.current = false;
      setBusy(false);
    }
  }
  async function signOut() {
    if (preview) return;
    setBusy(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/student/sign-in");
      router.refresh();
    } catch {
      setError(
        t(
          "We could not sign you out. Please try again.",
          "No pudimos cerrar tu sesión. Inténtalo de nuevo.",
        ),
      );
      setBusy(false);
    }
  }
  const counselorUrl = safeCounselorUrl(school.counselor_url);
  const notices = (
    <>
      {error ? (
        <p role="alert" className="student-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="student-success">
          {success}
        </p>
      ) : null}
    </>
  );
  const profileForm = (
    <form className="student-form" onSubmit={saveProfile}>
      <label>
        {t("What should we call you?", "¿Cómo quieres que te llamemos?")}{" "}
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("First name or nickname", "Nombre o apodo")}
          required
          maxLength={50}
          autoComplete="given-name"
        />
      </label>
      <label>
        {t("Username (optional)", "Nombre de usuario (opcional)")}{" "}
        <input
          value={username}
          maxLength={30}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="your_nickname"
        />
        <small>
          {t(
            "3–30 letters, numbers, or underscores. Use a nickname, not personal contact information. There is no public student directory.",
            "De 3 a 30 letras, números o guiones bajos. Usa un apodo, no información de contacto personal. No hay un directorio público de estudiantes.",
          )}{" "}
        </small>
      </label>
      <label>
        {t("Your grade", "Tu grado")}{" "}
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          required
        >
          <option value="">{t("Choose your grade", "Elige tu grado")}</option>
          {STUDENT_GRADES.map((item) => (
            <option key={item} value={item}>
              {t("Grade", "Grado")} {item}
            </option>
          ))}
        </select>
      </label>
      <details className="student-profile-privacy" open={!profile}>
        <summary>
          {profile
            ? t(
                "Review your student privacy notice",
                "Revisa tu aviso de privacidad estudiantil",
              )
            : t(
                "Before you start: your student privacy",
                "Antes de empezar: tu privacidad",
              )}
        </summary>
        <div className="student-note">
          <h3>{t("Your student privacy", "Tu privacidad estudiantil")}</h3>
          <p>
            {t(
              "Clarity is an AI coach, not a counselor or emergency service. Your check-ins, goals, and chats are saved to your account. Chat messages are sent to our AI provider to generate a reply. Do not include sensitive details about yourself or other people.",
              "Clarity es una guía de IA, no un consejero ni un servicio de emergencias. Tus registros de ánimo, metas y chats se guardan en tu cuenta. Los mensajes se envían a nuestro proveedor de IA para generar una respuesta. No incluyas detalles sensibles sobre ti ni sobre otras personas.",
            )}{" "}
          </p>
          <p>
            {t(
              "Teachers cannot read your chats, goals or emotional scores. Approved school reports may show protected group participation counts. Optional topic choices and belonging answers have separate notices and may contribute to protected group reports. Teachers may record class attendance totals, but those are not linked to your private app activity. Nobody monitors this chat for emergencies. School or guardian permission is handled separately by your pilot coordinator.",
              "Tus docentes no pueden leer tus chats, metas ni puntuaciones emocionales. Los informes escolares autorizados pueden mostrar conteos grupales protegidos de participación. Los temas y la encuesta opcionales tienen avisos separados y pueden contribuir a informes grupales protegidos. Los docentes pueden registrar totales de asistencia de clase, sin vincularlos con tu actividad privada. Nadie vigila este chat para responder a emergencias. La coordinación del piloto gestiona los permisos escolares o familiares por separado.",
            )}{" "}
          </p>
          <p>
            {t(
              "If you choose Talk to your counselor, your preferred name and a request to connect are sent to Shelby. Your chats, goals, and check-in scores are not attached.",
              "Si eliges Habla con tu consejero, se envían a Shelby tu nombre preferido y una solicitud de contacto. No se adjuntan chats, metas ni registros de ánimo.",
            )}{" "}
          </p>
        </div>
      </details>
      <div className="student-privacy-links">
        <a
          href="https://amazegen.com/privacy.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Read the privacy policy", "Leer la política de privacidad")}{" "}
        </a>
        <a
          href="https://amazegen.com/terms.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Read the terms of use", "Leer los términos de uso")}{" "}
        </a>
      </div>
      <label className="student-checkbox">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          required
        />
        <span>
          {t(
            "I have read the student pilot notice and agree to the terms of use and privacy policy.",
            "Leí el aviso del piloto estudiantil y acepto los términos de uso y la política de privacidad.",
          )}{" "}
        </span>
      </label>
      <button className="student-action" disabled={busy || !acknowledged}>
        {busy
          ? t("Saving…", "Guardando…")
          : profile
            ? t("Save profile", "Guardar perfil")
            : t("Let’s get started", "Empecemos")}
      </button>
    </form>
  );

  if (!profile)
    return (
      <StudentShell
        name=""
        screen="home"
        onNavigate={() => {}}
        preview={preview}
      >
        <div className="student-intro">
          <p className="student-edition-label">
            {t(
              "Welcome to your student pilot",
              "Bienvenido a tu piloto estudiantil",
            )}
          </p>
          <h1>
            {t(
              "Make a little room for you.",
              "Haz un poco de espacio para ti.",
            )}
          </h1>
          <p>
            {t(
              "A few details to make Arize feel like your space.",
              "Unos detalles para que Arize sea tu espacio.",
            )}
          </p>
        </div>
        <div className="student-card student-narrow">
          {notices}
          {profileForm}
        </div>
        <div style={{ maxWidth: 760, marginTop: 20 }}>
          <StudentSafety />
        </div>
      </StudentShell>
    );

  return (
    <StudentShell
      name={profile.display_name}
      screen={screen}
      onNavigate={navigate}
      preview={preview}
      onRequestCounselor={requestCounselor}
      counselorStatus={counselorStatus}
      counselorDisabled={busy}
    >
      {screen === "home" ? (
        <>
          <div className="student-intro">
            <h1>
              {firstUse ? t("Welcome", "Bienvenido") : t("Hey", "Hola")},{" "}
              {profile.display_name}.
            </h1>
            <p>
              {t(
                "Private support for you, built by people like you.",
                "Un espacio personal de apoyo, creado por personas como tú.",
              )}
            </p>
          </div>
          {notices}
          <div className="student-grid">
            <div className="student-stack">
              <div className="student-banner">
                <div>
                  <h2>{t("Ready when you are.", "Cuando tú quieras.")}</h2>
                  <p>{t("One small step today.", "Un paso pequeño hoy.")}</p>
                </div>
                <div className="student-sun" aria-hidden="true">
                  <Sun size={42} />
                </div>
              </div>
              <section className="student-card">
                <div className="student-card-heading">
                  <span className="student-icon">
                    <Sun size={30} aria-hidden />
                  </span>
                  <div>
                    <h2>{t("Check in", "Registra tu ánimo")}</h2>
                    <p>
                      {firstUse
                        ? t(
                            "No check-ins yet. Try your first.",
                            "Aún no tienes registros de ánimo. Prueba el primero.",
                          )
                        : t(
                            "Notice how you feel. One minute.",
                            "Observa cómo te sientes. Solo un minuto.",
                          )}
                    </p>
                  </div>
                </div>
                {activity ? (
                  <>
                    {activity.checkIn ? (
                      <p style={{ marginBottom: 18 }}>
                        {t("Today:", "Hoy:")}{" "}
                        <strong>
                          {feelingLabel(activity.checkIn.score, language)} ·{" "}
                          {activity.checkIn.score}/10
                        </strong>
                      </p>
                    ) : null}
                    <button
                      className="student-action wide"
                      onClick={() => navigate("check-in")}
                    >
                      {activity.checkIn
                        ? t("Update check-in", "Actualizar mi registro")
                        : firstUse
                          ? t(
                              "Start my first check-in",
                              "Hacer mi primer registro",
                            )
                          : t("Start check-in", "Registrar mi ánimo")}
                    </button>
                  </>
                ) : (
                  <div
                    aria-label={t(
                      "Loading check-in",
                      "Cargando tu registro de ánimo",
                    )}
                    role="status"
                  >
                    <div className="student-skeleton" />
                    <div className="student-skeleton" style={{ height: 52 }} />
                  </div>
                )}
              </section>
              <div className="student-quick-grid">
                <a
                  href="/student?screen=clarity"
                  className="student-quick"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("clarity");
                  }}
                >
                  <span className="student-icon">
                    <Sparkles size={26} aria-hidden />
                  </span>
                  <div>
                    <h2>Clarity</h2>
                    <p>{t("AI coach", "Guía de IA")}</p>
                  </div>
                </a>
                <a
                  href="/student?screen=goals"
                  className="student-quick"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("goals");
                  }}
                >
                  <span className="student-icon">
                    <Target size={26} aria-hidden />
                  </span>
                  <div>
                    <h2>{t("Goals", "Metas")}</h2>
                    <p>{t("Your steps", "Tus pasos")}</p>
                  </div>
                </a>
              </div>
              <button
                className="student-action secondary wide"
                onClick={() => navigate("toolkit")}
              >
                {t(
                  "Explore your school-day toolkit",
                  "Explorar herramientas para tu día",
                )}
              </button>
            </div>
            <aside className="student-stack">
              <StudentSafety />
              <section className="student-note">
                <h3>{t("Your space. Your pace.", "Tu espacio. Tu ritmo.")}</h3>
                <p>
                  {t(
                    "Talk through a school day, set a small goal, or take a breath. You choose where to start.",
                    "Habla sobre tu día escolar, elige una meta pequeña o haz una pausa. Tú decides por dónde empezar.",
                  )}{" "}
                </p>
                <p>
                  {t("Student pilot ·", "Piloto estudiantil ·")} {school.name}
                </p>
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {screen === "toolkit" ? (
        <StudentLearningHub
          preview={preview}
          onReset={() => navigate("class-reset")}
          onCoach={(prompt) => {
            setDraft(prompt);
            setShowHistory(false);
            navigate("clarity");
          }}
        />
      ) : null}
      {screen === "class-reset" ? <StudentClassReset /> : null}

      {screen === "check-in" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>{t("How are you feeling?", "¿Cómo te sientes?")}</h1>
            <p>
              {t(
                "No right answer. Just notice where you are today.",
                "No hay una respuesta correcta. Solo observa cómo estás hoy.",
              )}
            </p>
          </div>
          {notices}
          <div className="student-card">
            <form className="student-form" onSubmit={saveCheckIn}>
              <label htmlFor="student-score">
                {t("Your feeling score, from 1 to 10", "Tu ánimo, del 1 al 10")}{" "}
                <input
                  id="student-score"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  aria-valuetext={`${score} ${t("out of 10", "de 10")}, ${feelingLabel(score, language)}`}
                />
              </label>
              <div className="student-score" aria-live="polite">
                <strong>{score}/10</strong>
                <p>{feelingLabel(score, language)}</p>
              </div>
              <p>
                {t(
                  "1 means having a very hard time. 10 means feeling great. This is a personal check-in, not a diagnosis.",
                  "1 significa que estás pasando un momento muy difícil. 10 significa que te sientes muy bien. Es una reflexión personal, no un diagnóstico.",
                )}{" "}
              </p>
              <button className="student-action" disabled={busy}>
                {busy
                  ? t("Saving…", "Guardando…")
                  : t("Save check-in", "Guardar mi registro")}
              </button>
            </form>
          </div>
          <div style={{ marginTop: 24 }}>
            <StudentSafety />
          </div>
        </div>
      ) : null}

      {screen === "goals" ? (
        <StudentGoals
          preview={preview}
          onCoach={() => {
            setDraft(
              t(
                "Help me plan a meaningful, manageable school week. What is one small goal I could start with?",
                "Ayúdame a planear una semana escolar útil y posible. ¿Con qué meta pequeña podría empezar?",
              ),
            );
            navigate("clarity");
          }}
        />
      ) : null}

      {screen === "counselor" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>{t("Talk to your counselor", "Habla con tu consejero")}</h1>
            <p>
              {t(
                "You do not have to figure everything out alone.",
                "No tienes que resolver todo por tu cuenta.",
              )}
            </p>
          </div>
          <section className="student-card">
            <h2>{t("Connect with Shelby", "Pide hablar con Shelby")}</h2>
            <p style={{ margin: "16px 0" }}>
              {t(
                "Send your preferred name and a request to connect. Your chats, goals, and check-in scores stay out of this notification.",
                "Envía tu nombre preferido y una solicitud de contacto. Esta notificación no incluye chats, metas ni registros de ánimo.",
              )}{" "}
            </p>
            {counselorStatus === "sent" ? (
              <div className="student-success" role="status">
                <strong>
                  {t(
                    "Your request has been sent to Shelby.",
                    "Tu solicitud se envió a Shelby.",
                  )}
                </strong>
                <p>
                  {t(
                    "The email service accepted your notification. This does not mean Shelby has read it. Your school’s response times apply.",
                    "El servicio de correo aceptó tu notificación. Esto no significa que Shelby la haya leído. Se aplican los tiempos de respuesta de tu escuela.",
                  )}{" "}
                </p>
              </div>
            ) : (
              <button
                className="student-action secondary"
                onClick={requestCounselor}
                disabled={
                  counselorStatus === "sending" || counselorStatus === "pending"
                }
              >
                {counselorStatus === "sending"
                  ? t("Sending your request…", "Enviando tu solicitud…")
                  : counselorStatus === "pending"
                    ? t("Confirmation pending", "Confirmación pendiente")
                    : t("Notify Shelby", "Avisar a Shelby")}
              </button>
            )}
            {counselorStatus === "preview" ? (
              <div
                className="student-note"
                role="status"
                style={{ margin: "18px 0" }}
              >
                <strong>
                  {t(
                    "Preview only — no email has been sent.",
                    "Solo vista previa: no se envió ningún correo.",
                  )}
                </strong>
                <p>
                  {t(
                    "In the connected app, this action sends your request to Shelby and shows a sent confirmation only after the email service accepts it.",
                    "En la aplicación conectada, esta acción envía tu solicitud a Shelby. Solo confirma el envío cuando el servicio de correo la acepta.",
                  )}{" "}
                </p>
              </div>
            ) : null}
            {counselorError ? (
              <p role="alert" className="student-error">
                {counselorError}
              </p>
            ) : null}
            <div style={{ marginTop: 28 }} />
            <h2>{school.name}</h2>
            <p style={{ margin: "18px 0" }}>{school.counselor_instructions}</p>
            {counselorUrl ? (
              <a
                className="student-action secondary"
                href={counselorUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(
                  "Open school counselor contact",
                  "Abrir el contacto de orientación escolar",
                )}{" "}
                <ChevronRight size={20} />
              </a>
            ) : (
              <div className="student-note">
                <h3>{t("Ask at your school", "Pregunta en tu escuela")}</h3>
                <p>
                  {t(
                    "Your school has not added an online contact link yet. A teacher or the school office can help you reach your counselor.",
                    "Tu escuela aún no ha añadido un enlace de contacto. Un docente o la oficina escolar puede ayudarte a contactar con tu consejero.",
                  )}{" "}
                </p>
              </div>
            )}
            <p style={{ marginTop: 22 }}>
              {t(
                "Viewing this page or sending a Clarity message does not notify anyone. Notifications are sent only when you choose Talk to your counselor or Notify Shelby. This is not monitored for emergencies.",
                "Ver esta página o enviar un mensaje a Clarity no avisa a nadie. Solo se envían avisos cuando eliges Habla con tu consejero o Avisar a Shelby. No se vigila para responder a emergencias.",
              )}{" "}
            </p>
          </section>
          <div style={{ marginTop: 22 }}>
            <StudentSafety />
          </div>
        </div>
      ) : null}

      {screen === "clarity" ? (
        <div className="student-narrow">
          <div className="student-page-title">
            <div>
              <h1>{t("Work it out with Clarity.", "Piénsalo con Clarity.")}</h1>
              <p>
                {t(
                  "School, friendships, or whatever is on your mind.",
                  "La escuela, tus amistades o lo que tengas en mente.",
                )}
              </p>
            </div>
            <div className="student-inline">
              <button
                className="student-action plain"
                disabled={busy}
                onClick={() => setShowHistory(!showHistory)}
              >
                <History size={18} /> {t("History", "Historial")}{" "}
              </button>
              <button
                className="student-action secondary"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setConversationId(null);
                  setConversationHasMore(false);
                  setConversationOffset(0);
                  setDraft("");
                  setShowHistory(false);
                  setError("");
                }}
              >
                {t("New chat", "Nuevo chat")}{" "}
              </button>
            </div>
          </div>
          <div className="student-note">
            <p>
              {t(
                "Clarity is an AI coach, not a real counselor. Chats are saved for your history and processed by our AI provider. Avoid sharing sensitive details. Nobody watches this chat live.",
                "Clarity es una guía de IA, no un consejero real. Los chats se guardan en tu historial y nuestro proveedor de IA los procesa. Evita compartir detalles sensibles. Nadie observa este chat en vivo.",
              )}{" "}
            </p>
          </div>
          {notices}
          {!showHistory && !messages.length ? (
            <StudentTopicStarters disabled={busy} onChoose={setDraft} />
          ) : null}
          {showHistory ? (
            <StudentHistory
              preview={preview}
              onOpen={loadConversation}
              disabled={busy}
            />
          ) : (
            <>
              <div
                className="student-chat"
                ref={threadRef}
                role="log"
                aria-label={t(
                  "Clarity conversation",
                  "Conversación con Clarity",
                )}
                aria-live="polite"
              >
                <div className="student-bubble">
                  {t(
                    "I’m Clarity, your AI coach. We can think through a tough school day or find one small next step. What’s on your mind?",
                    "Soy Clarity, tu guía de IA. Podemos pensar en un día escolar difícil o buscar un próximo paso pequeño. ¿Qué tienes en mente?",
                  )}{" "}
                </div>
                {messages.map((message, i) => (
                  <div
                    key={message.id ?? i}
                    className={`student-bubble ${message.role}`}
                  >
                    <span className="student-edition-label">
                      {message.role === "user"
                        ? t("You", "Tú")
                        : t("Clarity · AI coach", "Clarity · guía de IA")}
                    </span>
                    {message.content}
                  </div>
                ))}
                {busy ? (
                  <>{pendingMessage && <div className="student-bubble user"><span className="student-edition-label">{t("You · sending", "Tú · enviando")}</span>{pendingMessage}</div>}<p role="status">{t("Clarity is responding…", "Clarity está respondiendo…")}</p></>
                ) : null}
              </div>
              {conversationHasMore && conversationId ? (
                <button
                  className="student-action plain"
                  disabled={busy}
                  onClick={() =>
                    loadConversation(conversationId, conversationOffset)
                  }
                >
                  {t(
                    "Load more messages before continuing",
                    "Carga más mensajes antes de continuar",
                  )}{" "}
                </button>
              ) : null}
              {hasNewMessage && <button type="button" className="chat-latest-button" onClick={jumpToLatest}>{t("New message · Back to latest ↓", "Nuevo mensaje · Ir al último ↓")}</button>}
              <StudentChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={sendMessage}
                disabled={busy || conversationHasMore}
                busy={busy}
                composerRef={composerRef}
              />
            </>
          )}
          <StudentSafety />
        </div>
      ) : null}

      {screen === "profile" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>{t("Profile & settings", "Perfil y ajustes")}</h1>
            <p>
              {t(
                "Use a first name or nickname that feels like you.",
                "Usa un nombre o apodo con el que te identifiques.",
              )}
            </p>
          </div>
          {notices}
          <section className="student-card">{profileForm}</section>
          <section
            className="student-card student-settings-links"
            style={{ marginTop: 24 }}
          >
            <h2>{t("Support & privacy", "Apoyo y privacidad")}</h2>
            <button
              className="student-settings-link"
              onClick={() => navigate("toolkit")}
            >
              {t("School-day toolkit", "Herramientas para tu día")}{" "}
              <ChevronRight size={20} />
            </button>
            <button
              className="student-settings-link"
              onClick={() => navigate("feedback")}
            >
              {t("Share feedback", "Comparte tus ideas")}{" "}
              <ChevronRight size={20} />
            </button>
            <a
              className="student-settings-link"
              href="https://amazegen.com/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Privacy Policy", "Política de privacidad")}{" "}
              <ChevronRight size={20} />
            </a>
            <a
              className="student-settings-link"
              href="https://amazegen.com/terms.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Terms of Use", "Términos de uso")} <ChevronRight size={20} />
            </a>
            <p>
              {t(
                "Student pilot access is managed by your school. No purchases or adult membership controls are included.",
                "Tu escuela gestiona el acceso al piloto estudiantil. No incluye compras ni controles de membresías para adultos.",
              )}{" "}
            </p>
          </section>
          <div className="student-inline" style={{ marginTop: 24 }}>
            <button
              className="student-action plain"
              onClick={signOut}
              disabled={busy || preview}
            >
              {t("Sign out", "Cerrar sesión")}{" "}
            </button>
            <span>
              {t("Student pilot ·", "Piloto estudiantil ·")} {school.name}
            </span>
          </div>
        </div>
      ) : null}
      {screen === "feedback" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>{t("Your voice matters.", "Tu voz importa.")}</h1>
            <p>
              {t(
                "Help us make Arize more useful for students.",
                "Ayúdanos a mejorar Arize para estudiantes.",
              )}
            </p>
          </div>
          <section className="student-card">
            <h2>{t("Share feedback", "Comparte tus ideas")}</h2>
            <p style={{ margin: "16px 0" }}>
              {t(
                "Do not include private details about yourself or another student. Feedback is not monitored for emergencies.",
                "No incluyas detalles privados sobre ti ni sobre otro estudiante. Los comentarios no se vigilan para responder a emergencias.",
              )}{" "}
            </p>
            {safeCounselorUrl(process.env.NEXT_PUBLIC_STUDENT_FEEDBACK_URL) ? (
              <a
                className="student-action"
                href={
                  safeCounselorUrl(
                    process.env.NEXT_PUBLIC_STUDENT_FEEDBACK_URL,
                  )!
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(
                  "Open the student feedback survey",
                  "Abrir la encuesta de comentarios",
                )}{" "}
              </a>
            ) : (
              <p>
                {t(
                  "The student feedback survey is not connected yet. Your pilot coordinator can help you share app feedback.",
                  "La encuesta de comentarios aún no está conectada. Quien coordina tu piloto puede ayudarte a compartir tus ideas.",
                )}{" "}
              </p>
            )}
            <button
              className="student-action plain"
              style={{ marginTop: 20 }}
              onClick={() => navigate("profile")}
            >
              {t(
                "Back to Profile & Settings",
                "Volver a Perfil y ajustes",
              )}{" "}
            </button>
          </section>
        </div>
      ) : null}
    </StudentShell>
  );
}
