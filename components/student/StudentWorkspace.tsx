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
import { getUsernameError, normalizeUsername } from "@/lib/profile/username";

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
  const [username, setUsername] = useState(initialProfile?.username ?? "");
  const [acknowledged, setAcknowledged] = useState(
    initialProfile?.notice_version === STUDENT_NOTICE_VERSION,
  );
  const [day, setDay] = useState(localDay);
  const [score, setScore] = useState(6);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [conversationOffset, setConversationOffset] = useState(0);
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
      const usernameError = getUsernameError(username);
      if (usernameError) throw new Error(usernameError);
      if (!displayName.trim() || displayName.trim().length > 50)
        throw new Error("Choose a name between 1 and 50 characters.");
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
          ? "Profile updated in this preview only. No account was changed."
          : "Your profile is saved.",
      );
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
        Username (optional)
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
          3–30 letters, numbers, or underscores. Use a nickname, not personal
          contact information. There is no public student directory.
        </small>
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
      <details className="student-profile-privacy" open={!profile}>
        <summary>
          {profile
            ? "Review your student privacy notice"
            : "Before you start: your student privacy"}
        </summary>
        <div className="student-note">
          <h3>Your student privacy</h3>
          <p>
            Clarity is an AI coach, not a counselor or emergency service. Your
            check-ins, goals, and chats are saved to your account. Chat messages
            are sent to our AI provider to generate a reply. Do not include
            sensitive details about yourself or other people.
          </p>
          <p>
            This pilot does not give teachers a live view of your activity.
            Nobody monitors this chat for emergencies. School or guardian
            permission is handled separately by your pilot coordinator.
          </p>
          <p>
            If you choose Talk to your counselor, your preferred name and a
            request to connect are sent to Shelby. Your chats, goals, and
            check-in scores are not attached.
          </p>
        </div>
      </details>
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
        <StudentGoals
          preview={preview}
          onCoach={() => {
            setDraft(
              "Help me plan a meaningful, manageable school week. What is one small goal I could start with?",
            );
            navigate("clarity");
          }}
        />
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
                  setConversationHasMore(false);
                  setConversationOffset(0);
                  setDraft("");
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
          {notices}
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
                role="log"
                aria-label="Clarity conversation"
                aria-live="polite"
              >
                <div className="student-bubble">
                  I’m Clarity, your AI coach. We can think through a tough
                  school day or find one small next step. What’s on your mind?
                </div>
                {messages.map((message, i) => (
                  <div
                    key={message.id ?? i}
                    className={`student-bubble ${message.role}`}
                  >
                    <span className="student-edition-label">
                      {message.role === "user" ? "You" : "Clarity · AI coach"}
                    </span>
                    {message.content}
                  </div>
                ))}
                {busy ? <p role="status">One moment…</p> : null}
              </div>
              {conversationHasMore && conversationId ? (
                <button
                  className="student-action plain"
                  disabled={busy}
                  onClick={() =>
                    loadConversation(conversationId, conversationOffset)
                  }
                >
                  Load more messages before continuing
                </button>
              ) : null}
              <StudentChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={sendMessage}
                disabled={busy || conversationHasMore}
                busy={busy}
              />
            </>
          )}
          <StudentSafety />
        </div>
      ) : null}

      {screen === "profile" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>Profile & settings</h1>
            <p>Use a first name or nickname that feels like you.</p>
          </div>
          {notices}
          <section className="student-card">{profileForm}</section>
          <section
            className="student-card student-settings-links"
            style={{ marginTop: 24 }}
          >
            <h2>Support & privacy</h2>
            <button
              className="student-settings-link"
              onClick={() => navigate("feedback")}
            >
              Share feedback <ChevronRight size={20} />
            </button>
            <a
              className="student-settings-link"
              href="https://amazegen.com/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy <ChevronRight size={20} />
            </a>
            <a
              className="student-settings-link"
              href="https://amazegen.com/terms.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Use <ChevronRight size={20} />
            </a>
            <p>
              Student pilot access is managed by your school. No purchases or
              adult membership controls are included.
            </p>
          </section>
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
      {screen === "feedback" ? (
        <div className="student-narrow">
          <div className="student-intro">
            <h1>Your voice matters.</h1>
            <p>Help us make Arize more useful for students.</p>
          </div>
          <section className="student-card">
            <h2>Share feedback</h2>
            <p style={{ margin: "16px 0" }}>
              Do not include private details about yourself or another student.
              Feedback is not monitored for emergencies.
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
                Open the student feedback survey
              </a>
            ) : (
              <p>
                The student feedback survey is not connected yet. Your pilot
                coordinator can help you share app feedback.
              </p>
            )}
            <button
              className="student-action plain"
              style={{ marginTop: 20 }}
              onClick={() => navigate("profile")}
            >
              Back to Profile & Settings
            </button>
          </section>
        </div>
      ) : null}
    </StudentShell>
  );
}
