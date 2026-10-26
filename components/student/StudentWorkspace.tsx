"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Send,
  Sparkles,
  Sun,
  Target,
} from "lucide-react";
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

type Profile = { display_name: string; grade: string; notice_version: string };
type School = {
  name: string;
  counselor_url: string | null;
  counselor_instructions: string;
};
type Goal = { id: string; title: string; is_complete: boolean; day: string };
type Message = { role: "user" | "assistant"; content: string };
type Activity = {
  checkIn: { score: number; day: string } | null;
  goals: Goal[];
  conversations: { id: string; title: string; created_at: string }[];
};

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function previousDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function StudentWorkspace({
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
  const router = useRouter();
  const screen = initialScreen;
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(
    initialProfile?.display_name ?? "",
  );
  const [grade, setGrade] = useState(initialProfile?.grade ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [day, setDay] = useState(localDay);
  const [score, setScore] = useState(6);
  const [goalTitle, setGoalTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
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
              : "Your activity could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [day, preview, profile, reload]);

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
          : "We could not confirm that your request was sent. Please try again.",
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
      const next = preview
        ? {
            profile: {
              display_name: displayName.trim(),
              grade,
              notice_version: STUDENT_NOTICE_VERSION,
            },
          }
        : await mutate({ action: "profile", displayName, grade, acknowledged });
      setProfile(next.profile);
      setSuccess("Your profile is saved.");
      setReload((n) => n + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your profile could not be saved.",
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
      setSuccess("Check-in saved. Thanks for taking a moment for yourself.");
      setReload((n) => n + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your check-in could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = preview
        ? {
            goal: {
              id: crypto.randomUUID(),
              title: goalTitle.trim(),
              is_complete: false,
              day,
            },
          }
        : await mutate({ action: "add-goal", title: goalTitle, day });
      setActivity((old) => ({
        checkIn: old?.checkIn ?? null,
        conversations: old?.conversations ?? [],
        goals: [...(old?.goals ?? []), result.goal],
      }));
      setGoalTitle("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your goal could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleGoal(goal: Goal) {
    setBusy(true);
    setError("");
    try {
      const result = preview
        ? { goal: { ...goal, is_complete: !goal.is_complete } }
        : await mutate({
            action: "toggle-goal",
            id: goal.id,
            complete: !goal.is_complete,
          });
      setActivity((old) =>
        old
          ? {
              ...old,
              goals: old.goals.map((item) =>
                item.id === goal.id ? result.goal : item,
              ),
            }
          : old,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your goal could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadConversation(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/student/coach?conversation=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessages(result.messages);
      setConversationId(id);
      setShowHistory(false);
    } catch {
      setError("Your conversation could not be loaded. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    if (preview) {
      setError(
        "This is a design preview. No messages are sent to AI or saved.",
      );
      return;
    }
    const content = draft.trim();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/student/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversationId }),
      });
      const result = await response.json();
      if (result.conversationId) {
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
      setError(
        reason instanceof Error
          ? reason.message
          : "Clarity is unavailable right now. Please try later.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (preview) return;
    setBusy(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      window.location.assign("/student/sign-in");
    } catch {
      setError("We could not sign you out. Please try again.");
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
        What should we call you?
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="First name or nickname"
          required
          maxLength={50}
          autoComplete="given-name"
        />
      </label>
      <label>
        Your grade
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          required
        >
          <option value="">Choose your grade</option>
          {STUDENT_GRADES.map((item) => (
            <option key={item} value={item}>
              Grade {item}
            </option>
          ))}
        </select>
      </label>
      <div className="student-note">
        <h3>A quick note before you start</h3>
        <p>
          Clarity is an AI coach, not a counselor or emergency service. Your
          check-ins, goals, and chats are saved to your account. Chat messages
          are sent to our AI provider to generate a reply. Do not include
          sensitive details about yourself or other people.
        </p>
        <p>
          This pilot does not give teachers a live view of your activity. Nobody
          monitors this chat for emergencies. School or guardian permission is
          handled separately by your pilot coordinator.
        </p>
        <p>
          If you choose Talk to your counselor, your preferred name and a
          request to connect are sent to Shelby. Your chats, goals, and check-in
          scores are not attached.
        </p>
      </div>
      <div className="student-privacy-links">
        <a
          href="https://amazegen.com/privacy.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the privacy policy
        </a>
        <a
          href="https://amazegen.com/terms.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the terms of use
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
          I have read the student pilot notice and agree to the terms of use and
          privacy policy.
        </span>
      </label>
      <button className="student-action" disabled={busy || !acknowledged}>
        {busy ? "Saving…" : profile ? "Save profile" : "Let’s get started"}
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
          <p className="student-edition-label">Welcome to your student pilot</p>
          <h1>Make a little room for you.</h1>
          <p>A few details to make Arize feel like your space.</p>
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
              {firstUse ? "Welcome" : "Hey"}, {profile.display_name}.
            </h1>
            <p>Private support for you, built by people like you.</p>
          </div>
          {notices}
          <div className="student-grid">
            <div className="student-stack">
              <div className="student-banner">
                <div>
                  <h2>Ready when you are.</h2>
                  <p>One small step today.</p>
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
                    <h2>Check in</h2>
                    <p>
                      {firstUse
                        ? "No check-ins yet. Try your first."
                        : "Notice how you feel. One minute."}
                    </p>
                  </div>
                </div>
                {activity ? (
                  <>
                    {activity.checkIn ? (
                      <p style={{ marginBottom: 18 }}>
                        Today:{" "}
                        <strong>
                          {feelingLabel(activity.checkIn.score)} ·{" "}
                          {activity.checkIn.score}/10
                        </strong>
                      </p>
                    ) : null}
                    <button
                      className="student-action wide"
                      onClick={() => navigate("check-in")}
                    >
                      {activity.checkIn
                        ? "Update check-in"
                        : firstUse
                          ? "Start my first check-in"
                          : "Start check-in"}
                    </button>
                  </>
                ) : (
                  <div aria-label="Loading check-in" role="status">
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
                    <p>AI coach</p>
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
                    <h2>Goals</h2>
                    <p>Your steps</p>
                  </div>
                </a>
              </div>
            </div>
            <aside className="student-stack">
              <StudentSafety />
              <section className="student-note">
                <h3>Your space. Your pace.</h3>
                <p>
                  Talk through a school day, set a small goal, or take a breath.
                  You choose where to start.
                </p>
                <p>Student pilot · {school.name}</p>
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {screen === "check-in" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>How are you feeling?</h1>
            <p>No right answer. Just notice where you are today.</p>
          </div>
          {notices}
          <div className="student-card">
            <form className="student-form" onSubmit={saveCheckIn}>
              <label htmlFor="student-score">
                Your feeling score, from 1 to 10
                <input
                  id="student-score"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  aria-valuetext={`${score} out of 10, ${feelingLabel(score)}`}
                />
              </label>
              <div className="student-score" aria-live="polite">
                <strong>{score}/10</strong>
                <p>{feelingLabel(score)}</p>
              </div>
              <p>
                1 means having a very hard time. 10 means feeling great. This is
                a personal check-in, not a diagnosis.
              </p>
              <button className="student-action" disabled={busy}>
                {busy ? "Saving…" : "Save check-in"}
              </button>
            </form>
          </div>
          <div style={{ marginTop: 24 }}>
            <StudentSafety />
          </div>
        </div>
      ) : null}

      {screen === "goals" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>Small steps count.</h1>
            <p>One doable thing can be enough.</p>
          </div>
          <div className="student-inline" style={{ marginBottom: 24 }}>
            <button
              className="student-action plain"
              aria-label="Previous day’s goals"
              disabled={busy}
              onClick={() => {
                chooseDay(previousDay(day, -1));
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <label>
              Goals for{" "}
              <input
                className="student-date"
                aria-label="Goal date"
                type="date"
                value={day}
                max={localDay()}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) {
                    chooseDay(e.target.value);
                  }
                }}
              />
            </label>
            <button
              className="student-action plain"
              aria-label="Next day’s goals"
              disabled={busy || day >= localDay()}
              onClick={() => {
                chooseDay(previousDay(day, 1));
              }}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          {notices}
          <section className="student-card">
            {activity ? (
              activity.goals.length ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {activity.goals.map((goal) => (
                    <li
                      key={goal.id}
                      className={`student-goal${goal.is_complete ? " complete" : ""}`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={goal.is_complete}
                        aria-label={`${goal.is_complete ? "Reopen" : "Complete"} ${goal.title}`}
                        onClick={() => toggleGoal(goal)}
                        disabled={busy}
                      >
                        {goal.is_complete ? <Check size={20} /> : null}
                      </button>
                      <span>{goal.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No goals for this day. Keep your next step small and kind.
                </p>
              )
            ) : (
              <p role="status">Loading your goals…</p>
            )}
            {day === localDay() ? (
              <form
                className="student-form"
                style={{ marginTop: 26 }}
                onSubmit={addGoal}
              >
                <label>
                  What is one thing you want to do?
                  <input
                    maxLength={160}
                    required
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="For example, take a break after class"
                  />
                </label>
                <button
                  className="student-action"
                  disabled={busy || !goalTitle.trim()}
                >
                  {busy ? "Saving…" : "Add a goal"}
                </button>
              </form>
            ) : (
              <p style={{ marginTop: 20 }}>
                Looking back at a previous day. You can check off a goal you
                completed.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {screen === "counselor" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>Talk to your counselor</h1>
            <p>You do not have to figure everything out alone.</p>
          </div>
          <section className="student-card">
            <h2>Connect with Shelby</h2>
            <p style={{ margin: "16px 0" }}>
              Send your preferred name and a request to connect. Your chats,
              goals, and check-in scores stay out of this notification.
            </p>
            {counselorStatus === "sent" ? (
              <div className="student-success" role="status">
                <strong>Your request has been sent to Shelby.</strong>
                <p>
                  The email service accepted your notification. This does not
                  mean Shelby has read it. Your school’s response times apply.
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
                  ? "Sending your request…"
                  : counselorStatus === "pending"
                    ? "Confirmation pending"
                    : "Notify Shelby"}
              </button>
            )}
            {counselorStatus === "preview" ? (
              <div
                className="student-note"
                role="status"
                style={{ margin: "18px 0" }}
              >
                <strong>Preview only — no email has been sent.</strong>
                <p>
                  In the connected app, this action sends your request to Shelby
                  and shows a sent confirmation only after the email service
                  accepts it.
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
                Open school counselor contact <ChevronRight size={20} />
              </a>
            ) : (
              <div className="student-note">
                <h3>Ask at your school</h3>
                <p>
                  Your school has not added an online contact link yet. A
                  teacher or the school office can help you reach your
                  counselor.
                </p>
              </div>
            )}
            <p style={{ marginTop: 22 }}>
              Viewing this page or sending a Clarity message does not notify
              anyone. Notifications are sent only when you choose Talk to your
              counselor or Notify Shelby. This is not monitored for emergencies.
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
              <h1>Work it out with Clarity.</h1>
              <p>School, friendships, or whatever is on your mind.</p>
            </div>
            <div className="student-inline">
              <button
                className="student-action plain"
                disabled={busy}
                onClick={() => setShowHistory(!showHistory)}
              >
                <History size={18} /> History
              </button>
              <button
                className="student-action secondary"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setConversationId(null);
                  setShowHistory(false);
                  setError("");
                }}
              >
                New chat
              </button>
            </div>
          </div>
          <div className="student-note">
            <p>
              Clarity is an AI coach, not a real counselor. Chats are saved for
              your history and processed by our AI provider. Avoid sharing
              sensitive details. Nobody watches this chat live.
            </p>
          </div>
          {showHistory ? (
            <section
              className="student-card student-history"
              aria-label="Your conversation history"
            >
              <h2>Your conversations</h2>
              {activity?.conversations.length ? (
                activity.conversations.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadConversation(item.id)}
                    disabled={busy}
                  >
                    {item.title}
                    <br />
                    <small>
                      {new Date(item.created_at).toLocaleDateString()}
                    </small>
                  </button>
                ))
              ) : (
                <p>No saved conversations yet.</p>
              )}
            </section>
          ) : (
            <>
              <div
                className="student-chat"
                role="log"
                aria-label="Clarity conversation"
                aria-live="polite"
              >
                <div className="student-bubble">
                  I’m Clarity, your AI coach. We can think through a tough
                  school day or find one small next step. What’s on your mind?
                </div>
                {messages.map((message, i) => (
                  <div key={i} className={`student-bubble ${message.role}`}>
                    <span className="student-edition-label">
                      {message.role === "user" ? "You" : "Clarity · AI coach"}
                    </span>
                    {message.content}
                  </div>
                ))}
                {busy ? <p role="status">One moment…</p> : null}
              </div>
              {notices}
              <form className="student-chat-composer" onSubmit={sendMessage}>
                <textarea
                  aria-label="Message Clarity"
                  placeholder="Say something to Clarity…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  disabled={busy}
                />
                <button
                  className="student-action"
                  type="submit"
                  disabled={busy || !draft.trim()}
                  aria-label="Send message"
                >
                  <Send size={22} />
                </button>
              </form>
            </>
          )}
          <StudentSafety />
        </div>
      ) : null}

      {screen === "profile" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>Your profile</h1>
            <p>Use a first name or nickname that feels like you.</p>
          </div>
          {notices}
          <section className="student-card">{profileForm}</section>
          <div className="student-inline" style={{ marginTop: 24 }}>
            <button
              className="student-action plain"
              onClick={signOut}
              disabled={busy || preview}
            >
              Sign out
            </button>
            <span>Student pilot · {school.name}</span>
          </div>
        </div>
      ) : null}
    </StudentShell>
  );
}
