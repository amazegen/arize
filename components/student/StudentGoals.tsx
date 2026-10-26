"use client";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  TrendingUp,
  Archive,
  Undo2,
} from "lucide-react";
import {
  dateKey,
  GOAL_CATEGORIES,
  shiftDay,
  validateGoal,
  weekStart,
  type StudentGoal,
} from "@/lib/student/features";
import StudentPatternMap from "./StudentPatternMap";

function sampleGoals(): StudentGoal[] {
  const week = weekStart();
  return [
    {
      id: "sample-school",
      title: "Break my project into three small steps",
      category: "School",
      deadline: dateKey(),
      notes: "Start with a ten-minute outline after class.",
      day: dateKey(),
      week_of: week,
      progress: 0,
      is_complete: false,
      archived_at: null,
    },
    {
      id: "sample-wellness",
      title: "Make time for a walk",
      category: "Wellness",
      deadline: null,
      notes: "A week-long goal. A little movement counts.",
      day: week,
      week_of: week,
      progress: 100,
      is_complete: true,
      archived_at: null,
    },
  ];
}
const emptyDraft = () => ({
  title: "",
  category: "Personal",
  deadline: "",
  notes: "",
});

export default function StudentGoals({
  preview,
  onCoach,
}: {
  preview: boolean;
  onCoach: () => void;
}) {
  const [week, setWeek] = useState(weekStart);
  const [selectedDay, setSelectedDay] = useState(dateKey);
  const [goals, setGoals] = useState<StudentGoal[]>(() =>
    preview ? sampleGoals() : [],
  );
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<"goals" | "patterns">("goals");
  const [editing, setEditing] = useState<StudentGoal | null | undefined>(
    undefined,
  );
  const [draft, setDraft] = useState(emptyDraft);
  const [removed, setRemoved] = useState<StudentGoal | null>(null);

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch(`/api/student/features?week=${week}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted) setGoals(body.goals);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Your goals could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [week, preview, reload]);
  const weekGoals = goals.filter((g) => g.week_of === week && !g.archived_at);
  const visible = weekGoals.filter(
    (g) => !g.deadline || g.deadline === selectedDay,
  );
  const done = weekGoals.filter((g) => g.is_complete).length;
  function moveWeek(offset: number) {
    const next = shiftDay(week, offset * 7);
    setWeek(next);
    setSelectedDay(next);
    setEditing(undefined);
    setError("");
    setMessage("");
    if (!preview) {
      setGoals([]);
      setLoading(true);
    }
  }
  function edit(goal: StudentGoal | null) {
    setEditing(goal);
    setDraft(
      goal
        ? {
            title: goal.title,
            category: goal.category,
            deadline: goal.deadline ?? "",
            notes: goal.notes,
          }
        : emptyDraft(),
    );
    setError("");
    setMessage("");
  }
  async function write(body: Record<string, unknown>) {
    const response = await fetch("/api/student/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Your goal could not be saved.");
    return data.goal as StudentGoal;
  }
  function replace(goal: StudentGoal) {
    setGoals((old) => [...old.filter((g) => g.id !== goal.id), goal]);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const checked = validateGoal({ ...draft, week });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const goal = preview
        ? {
            ...checked.goal,
            id: editing?.id ?? crypto.randomUUID(),
            week_of: week,
            progress: editing?.progress ?? 0,
            is_complete: editing?.is_complete ?? false,
            archived_at: null,
          }
        : await write({
            action: "save-goal",
            ...draft,
            week,
            ...(editing ? { id: editing.id } : {}),
          });
      replace(goal);
      setEditing(undefined);
      setMessage(
        preview
          ? "Goal saved in this preview only."
          : "Your goal is saved. Other goals are unchanged.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your goal could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function update(
    goal: StudentGoal,
    action: "complete-goal" | "archive-goal",
    value: boolean,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = preview
        ? {
            ...goal,
            ...(action === "complete-goal"
              ? { is_complete: value, progress: value ? 100 : 0 }
              : { archived_at: value ? new Date().toISOString() : null }),
          }
        : await write({
            id: goal.id,
            action,
            ...(action === "complete-goal"
              ? { complete: value }
              : { archive: value }),
          });
      replace(next);
      if (action === "archive-goal") {
        setRemoved(value ? goal : null);
        setMessage(
          value ? "Goal removed. You can undo this below." : "Goal restored.",
        );
      }
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
  if (view === "patterns")
    return (
      <StudentPatternMap preview={preview} onBack={() => setView("goals")} />
    );
  return (
    <div className="student-narrow">
      <div className="student-page-title">
        <div>
          <p className="student-edition-label">Goals & accountability</p>
          <h1>Your goals. Your pace.</h1>
          <p>Plan a week that leaves room for you.</p>
        </div>
      </div>
      <div className="student-week-bar">
        <button
          className="student-action plain"
          aria-label="View previous week"
          disabled={busy}
          onClick={() => moveWeek(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <strong>
            Week of{" "}
            {new Date(`${week}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </strong>
          <p>
            {done} of {weekGoals.length} complete
          </p>
        </div>
        <button
          className="student-action plain"
          aria-label="View next week"
          disabled={busy || week >= weekStart()}
          onClick={() => moveWeek(1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="student-week-days" aria-label="Choose a day">
        {Array.from({ length: 7 }, (_, i) => {
          const day = shiftDay(week, i);
          const date = new Date(`${day}T12:00:00`);
          return (
            <button
              key={day}
              aria-label={`Goals for ${date.toLocaleDateString()}`}
              aria-pressed={selectedDay === day}
              disabled={busy}
              onClick={() => {
                setSelectedDay(day);
                setEditing(undefined);
              }}
            >
              <span>
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <strong>{date.getDate()}</strong>
            </button>
          );
        })}
      </div>
      <div className="student-goal-tools">
        <button
          className="student-action"
          disabled={busy || loading}
          onClick={() => edit(null)}
        >
          <Plus size={18} /> Plan a goal
        </button>
        <button
          className="student-action secondary"
          disabled={busy}
          onClick={() => setView("patterns")}
        >
          <TrendingUp size={18} /> Pattern Map
        </button>
        <button
          className="student-action plain"
          disabled={busy}
          onClick={onCoach}
        >
          Think it through with Clarity
        </button>
      </div>
      {error ? (
        <div className="student-error" role="alert">
          {error}{" "}
          <button
            className="student-action plain"
            onClick={() => {
              setError("");
              setLoading(!preview);
              setReload((n) => n + 1);
            }}
            disabled={busy}
          >
            Reload goals
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="student-success" role="status">
          {message}
        </p>
      ) : null}
      {removed ? (
        <button
          className="student-action plain"
          disabled={busy}
          onClick={() => update(removed, "archive-goal", false)}
        >
          <Undo2 size={18} /> Undo removal
        </button>
      ) : null}
      {editing !== undefined ? (
        <section className="student-card student-goal-editor">
          <h2>{editing ? "Edit your goal" : "Plan this week"}</h2>
          <p>Choose a date, or leave it open for the whole week.</p>
          <form className="student-form" onSubmit={save}>
            <label>
              Your goal
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="One small, meaningful step"
              />
            </label>
            <label>
              Category
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Deadline (optional)
              <input
                type="date"
                min={week}
                max={shiftDay(week, 6)}
                value={draft.deadline}
                onChange={(e) =>
                  setDraft({ ...draft, deadline: e.target.value })
                }
              />
            </label>
            <label>
              Notes (optional)
              <textarea
                rows={3}
                maxLength={1600}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="What would make this easier?"
              />
            </label>
            <div className="student-inline">
              <button className="student-action" disabled={busy}>
                {busy ? "Saving…" : "Save goal"}
              </button>
              <button
                type="button"
                className="student-action plain"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <h2 className="student-goal-day-title">
        {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </h2>
      <p>Goals for this day, plus your week-long commitments.</p>
      {loading ? (
        <p role="status">Loading your goals…</p>
      ) : visible.length ? (
        <ul className="student-goal-list">
          {visible.map((goal) => (
            <li
              key={goal.id}
              className={`student-card student-goal-detail${goal.is_complete ? " complete" : ""}`}
            >
              <div className="student-goal-heading">
                <button
                  type="button"
                  className="student-goal-check"
                  role="checkbox"
                  aria-checked={goal.is_complete}
                  aria-label={`${goal.is_complete ? "Reopen" : "Complete"} ${goal.title}`}
                  disabled={busy}
                  onClick={() =>
                    update(goal, "complete-goal", !goal.is_complete)
                  }
                >
                  {goal.is_complete ? <Check size={20} /> : null}
                </button>
                <h3>{goal.title}</h3>
              </div>
              <p className="student-goal-meta">
                {goal.category} ·{" "}
                {goal.deadline
                  ? `Due ${new Date(`${goal.deadline}T12:00:00`).toLocaleDateString()}`
                  : "Week-long goal"}
              </p>
              {goal.notes ? (
                <p className="student-goal-notes">{goal.notes}</p>
              ) : null}
              <div
                className="student-progress"
                role="progressbar"
                aria-label={`${goal.title} progress`}
                aria-valuenow={goal.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${goal.progress}%` }} />
              </div>
              <div className="student-inline">
                <button
                  className="student-action plain"
                  disabled={busy}
                  onClick={() => edit(goal)}
                  aria-label={`Edit ${goal.title}`}
                >
                  <Pencil size={16} /> Edit
                </button>
                <button
                  className="student-action plain"
                  disabled={busy}
                  onClick={() => update(goal, "archive-goal", true)}
                  aria-label={`Remove ${goal.title}`}
                >
                  <Archive size={16} /> Remove
                </button>
                <span>{goal.is_complete ? "Completed" : "In progress"}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className="student-note" style={{ marginTop: 20 }}>
          <h3>A little room to start.</h3>
          <p>
            No goals scheduled for this day. Add a small step or browse another
            day.
          </p>
        </section>
      )}
    </div>
  );
}
