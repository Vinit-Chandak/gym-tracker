"use client";

import {
  useActionState,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError, useKeptForm } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { Switch } from "@/components/ui/switch";
import { RequestList } from "@/components/coaching/request-list";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { PLAN_LIMITS } from "@/domain/plan-limits";
import { attempted, keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveCoachNotesAction, setAiCoachEnabledAction } from "@/server/actions/coach";
import type { CoachDashboard } from "@/server/repositories/coach-dashboard";
import { INITIAL_FORM_STATE } from "@/server/validation/form";
import { Proposals } from "../programme/proposals";

export type CoachAttempt = {
  id: string;
  when: string;
  trigger: string;
  status: string;
  gymName: string | null;
  error: string | null;
};

type Props = {
  workflow?: boolean;
  enabled: boolean;
  status: string | null;
  noteId: string;
  notes: {
    id: string;
    text: string;
    when: string;
    outcome: string | null;
    sport?: ActivitySport | null;
  }[];
  overview: string;
  attempts: CoachAttempt[];
  dashboard?: CoachDashboard | null;
  children?: ReactNode;
};
type Tab = "overview" | "requests" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Requests & changes" },
  { id: "notes", label: "Notes & memory" },
];

/** One task at a time; panels stay mounted so switching views never discards an answer. */
export function AiCoachSettings({
  workflow = false,
  enabled,
  status,
  noteId,
  notes,
  overview,
  attempts,
  dashboard,
  children,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [filter, setFilter] = useState("all");
  const [scope, setScope] = useState("all");
  const [text, setText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useKeptForm();
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const [state, formAction, sending] = useActionState(
    keepsFormOnDisconnect(saveCoachNotesAction),
    INITIAL_FORM_STATE,
  );
  const saved =
    state !== INITIAL_FORM_STATE && !state.fieldErrors && !state.formError && !state.values;
  const [fresh, setFresh] = useState({ id: noteId, after: state });
  if (saved && fresh.after !== state) {
    setFresh({ id: noteId, after: state });
    setText("");
  }
  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      const outcome = await attempted(
        () => setAiCoachEnabledAction(next),
        "Could not save. Check your connection and try again.",
      );
      if (!outcome.ok) startTransition(() => setError(outcome.message));
    });
  const programmes = dashboard?.programmes ?? [];
  const scopeName = (sport: ActivitySport | null | undefined) =>
    sport ? ACTIVITY_SPORT_LABELS[sport] : "General note";
  const inScope = (item: { sport?: ActivitySport | null }) =>
    filter === "all" || item.sport === filter || item.sport == null;
  const proposals = dashboard?.proposals.filter(inScope) ?? [];
  const needsInput =
    dashboard?.jobs.filter((job) => job.status === "needs_input" && inScope(job)) ?? [];
  const requests = dashboard?.requests.filter(inScope) ?? [];
  const questions = requests.filter((request) => request.state === "needs_answer");
  const withCoach = requests.filter(
    (request) => request.state !== "needs_answer" && request.state !== "proposed",
  );
  const known = overview
    .split("\n")
    .map((line) =>
      line.replace(/^(preference|trend|observation|experiment|decision):\s*/i, "").trim(),
    )
    .filter(Boolean);
  const waiting = dashboard?.waiting ?? 0;

  return (
    <div className="coach-hub">
      <header className="coach-hub-heading">
        <div>
          <p className="coach-eyebrow">YOUR TRAINING PARTNER</p>
          <h1 className="type-display">AI coach</h1>
          <p className="coach-subtitle">
            What the coach knows, what it is working on, and what you have asked.
          </p>
        </div>
        <div className="coach-power">
          <Switch label="AI coach" checked={shown} onChange={change} disabled={pending} />
          <span>{shown ? "On" : "Off"}</span>
        </div>
      </header>
      {shown && status && (
        <p className="coach-notice" role="status">
          {status}
        </p>
      )}
      {!shown && (
        <p className="coach-notice">
          Coaching is paused. Your programmes and saved notes are still here.
        </p>
      )}
      {error && (
        <p role="alert" className="coach-notice">
          {error}
        </p>
      )}

      <div className="coach-tabs" role="tablist" aria-label="AI coach views">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            id={`coach-tab-${item.id}`}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            aria-controls={`coach-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % TABS.length
                  : event.key === "ArrowLeft"
                    ? (index + TABS.length - 1) % TABS.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? TABS.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setTab(TABS[next]!.id);
              (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
            }}
          >
            <span className="coach-tab-label">{item.label}</span>
            {item.id === "requests" && waiting > 0 && (
              <span className="coach-count">
                {waiting}
                <span className="sr-only"> need your attention</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <section
        id="coach-panel-overview"
        role="tabpanel"
        aria-labelledby="coach-tab-overview"
        hidden={tab !== "overview"}
        className="coach-panel"
      >
        {waiting > 0 && (
          <button className="coach-attention" type="button" onClick={() => setTab("requests")}>
            <span className="coach-attention-icon">
              <Glyph name="note" className="glyph-24" />
            </span>
            <span>
              <strong>
                {waiting} {waiting === 1 ? "item needs" : "items need"} your attention
              </strong>
              <span>Review proposals and answer your coach.</span>
            </span>
            <Glyph name="chevronRight" className="glyph-20" />
          </button>
        )}
        {children}
        {!!dashboard?.jobs.length && (
          <Disclosure
            summary="Coach activity"
            meta={
              dashboard.jobs.some((job) => job.status === "failed")
                ? "A run needs attention"
                : `${dashboard.jobs.length} in progress`
            }
          >
            <ul className="coach-history-list">
              {dashboard.jobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/profile/programme/jobs/${job.id}` as Route}>
                    <span className="coach-scope-label">{scopeName(job.sport)}</span>
                    <strong>
                      {job.kind === "create_program"
                        ? `Creating a ${job.scope}`
                        : job.kind === "review_program"
                          ? "Reviewing your programme"
                          : "Preparing your next session"}
                    </strong>
                    <span className="coach-muted">
                      {job.status === "failed"
                        ? "Could not finish · open to see details"
                        : job.status === "needs_input"
                          ? "Needs your input"
                          : job.progress === "waiting"
                            ? "Queued for the next coach run"
                            : "In progress"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}

        <section className="coach-compose-card" aria-labelledby="tell-coach">
          <div className="coach-section-heading">
            <div>
              <h2 id="tell-coach">Tell your coach</h2>
              <p className="coach-muted">
                Ask for a change, share feedback, or add something to remember.
              </p>
            </div>
            <Glyph name="coach" className="glyph-24" />
          </div>
          <form ref={form} action={formAction} className="coach-message-form">
            <input type="hidden" name="noteId" value={state.values?.noteId ?? fresh.id} />
            {workflow && programmes.length > 0 && (
              <div className="coach-field">
                <label htmlFor="coach-scope">Which programme is this for?</label>
                <select
                  id="coach-scope"
                  name="sport"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  disabled={sending}
                  aria-describedby="coach-scope-help"
                >
                  <option value="all">All my programmes</option>
                  {programmes.map((programme) => (
                    <option key={programme.id} value={programme.sport}>
                      {ACTIVITY_SPORT_LABELS[programme.sport]} · {programme.name}
                    </option>
                  ))}
                </select>
                <p id="coach-scope-help" className="coach-muted">
                  {scope === "all"
                    ? "Each active programme will receive this note."
                    : `Only your ${ACTIVITY_SPORT_LABELS[scope as ActivitySport]?.toLowerCase()} programme will receive this note.`}
                </p>
              </div>
            )}
            <div className="coach-field">
              <label htmlFor="coach-note">Notes for the coach</label>
              <textarea
                ref={textarea}
                id="coach-note"
                name="userNotes"
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
                maxLength={PLAN_LIMITS.memo}
                disabled={sending}
                placeholder={
                  scope === "all"
                    ? "e.g. I have less time next week. Can we adjust my training?"
                    : "e.g. Can we move this programme’s Thursday session to Friday?"
                }
                aria-invalid={Boolean(state.fieldErrors?.userNotes)}
                aria-describedby={state.fieldErrors?.userNotes ? "coach-note-error" : undefined}
              />
              {state.fieldErrors?.userNotes && (
                <p id="coach-note-error" role="alert">
                  {state.fieldErrors.userNotes}
                </p>
              )}
            </div>
            <FormError message={state.formError ?? state.fieldErrors?.sport} />
            <div className="coach-message-footer">
              <p className="coach-muted">
                {shown
                  ? "Read at the next coach run. Programme changes come back here for review."
                  : "Saved notes will be read when coaching resumes."}
              </p>
              <Button type="submit" disabled={sending || !text.trim()}>
                <Glyph name="send" className="glyph-18" />
                {sending ? "Sending…" : "Send note"}
              </Button>
            </div>
            <p className="coach-saved" role="status">
              {saved && !text ? "Note saved. You can follow its progress in Notes & memory." : ""}
            </p>
          </form>
        </section>
        {workflow && (
          <div className="coach-quick-links">
            <Link href="/profile/programme/create">
              <Glyph name="sliders" className="glyph-20" />
              <span>Strength goals & shared reports</span>
              <Glyph name="chevronRight" className="glyph-16" />
            </Link>
          </div>
        )}
      </section>

      <section
        id="coach-panel-requests"
        role="tabpanel"
        aria-labelledby="coach-tab-requests"
        hidden={tab !== "requests"}
        className="coach-panel"
      >
        <div className="coach-section-heading">
          <div>
            <h2>Requests & changes</h2>
            <p className="coach-muted">Your requests and the changes proposed in response.</p>
          </div>
        </div>
        <ScopeFilter value={filter} onChange={setFilter} id="requests-scope" />
        {needsInput.length > 0 && (
          <section className="coach-group">
            <h3>Your coach needs a little more</h3>
            <ul className="coach-change-list">
              {needsInput.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/profile/programme/jobs/${job.id}` as Route}
                    className="coach-change-row"
                  >
                    <span>
                      <span className="coach-scope-label">{scopeName(job.sport)}</span>
                      <strong>Finish your {job.scope} brief</strong>
                      <span className="coach-muted">Open the coach’s question to continue.</span>
                    </span>
                    <Glyph name="chevronRight" className="glyph-20" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {questions.length > 0 && (
          <section className="coach-group">
            <h3>
              Needs your answer <span className="coach-count">{questions.length}</span>
            </h3>
            {questions.map((request) => (
              <div key={request.id} className="coach-scoped-request">
                <p className="coach-scope-label">{scopeName(request.sport)}</p>
                <RequestList requests={[request]} />
              </div>
            ))}
          </section>
        )}
        {proposals.length > 0 && (
          <section className="coach-group">
            <h3>
              Ready for you <span className="coach-count">{proposals.length}</span>
            </h3>
            <ul className="coach-change-list">
              {proposals.map((proposal) => (
                <li key={proposal.id}>
                  <Link
                    href={
                      (proposal.status === "editing" && !proposal.fromCoach
                        ? proposal.sport === "strength"
                          ? `/profile/programme/manual?draft=${proposal.id}`
                          : `/plan/${proposal.sport}/edit?draft=${proposal.id}`
                        : `/profile/programme/drafts/${proposal.id}`) as Route
                    }
                    className="coach-change-row"
                  >
                    <span className="coach-row-icon">
                      <Glyph
                        name={proposal.kind === "change" ? "edit" : "plus"}
                        className="glyph-20"
                      />
                    </span>
                    <span>
                      <span className="coach-scope-label">{scopeName(proposal.sport)}</span>
                      <strong>{proposal.title}</strong>
                      <span className="coach-muted">
                        {proposal.status === "editing"
                          ? "Continue draft"
                          : proposal.kind === "change"
                            ? "Review programme changes"
                            : proposal.kind === "session"
                              ? "Review new session"
                              : "Review new programme"}
                        {!proposal.fromCoach ? " · Your draft" : ""}
                      </span>
                    </span>
                    <Glyph name="chevronRight" className="glyph-20" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!dashboard?.legacy.length && (filter === "all" || filter === "strength") && (
          <Disclosure summary="Earlier strength proposals" meta={String(dashboard.legacy.length)}>
            <Proposals proposals={dashboard.legacy} />
          </Disclosure>
        )}
        {!needsInput.length &&
          !questions.length &&
          !proposals.length &&
          !(dashboard?.legacy.length && (filter === "all" || filter === "strength")) && (
            <div className="coach-empty coach-empty-compact">
              <Glyph name="check" className="glyph-24" />
              <h3>You’re all caught up</h3>
              <p>Questions and proposed changes will appear here.</p>
            </div>
          )}
        {withCoach.length > 0 && (
          <Disclosure summary="With your coach" meta={String(withCoach.length)}>
            <div className="coach-group">
              {withCoach.map((request) => (
                <div key={request.id} className="coach-scoped-request">
                  <p className="coach-scope-label">{scopeName(request.sport)}</p>
                  <RequestList requests={[request]} />
                </div>
              ))}
            </div>
          </Disclosure>
        )}
        {!!dashboard?.recentChanges.filter(inScope).length && (
          <Disclosure
            summary="Recently updated"
            meta={String(dashboard.recentChanges.filter(inScope).length)}
          >
            <ul className="coach-history-list">
              {dashboard.recentChanges.filter(inScope).map((item) => (
                <li key={item.id}>
                  <Link href={`/profile/programme/drafts/${item.id}` as Route}>
                    <span className="coach-scope-label">{scopeName(item.sport)}</span>
                    <strong>{item.title}</strong>
                    <span className="coach-muted">Applied · {item.when}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
        <Disclosure summary="Past requests & changes">
          <div className="coach-group">
            {dashboard?.history.requests.filter(inScope).map((request) => (
              <div key={request.id}>
                <p className="coach-scope-label">{scopeName(request.sport)}</p>
                <RequestList requests={[request]} />
              </div>
            ))}
            <ul className="coach-history-list">
              {dashboard?.history.changes.filter(inScope).map((item) => (
                <li key={item.id}>
                  <Link href={`/profile/programme/drafts/${item.id}` as Route}>
                    <span className="coach-scope-label">{scopeName(item.sport)}</span>
                    <strong>{item.title}</strong>
                    <span className="coach-muted">
                      {item.outcome} · {item.when}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!dashboard?.history.requests.filter(inScope).length &&
              !dashboard?.history.changes.filter(inScope).length && (
                <p className="coach-muted">No past requests or changes yet.</p>
              )}
            <Link href="/profile/programme/history" className="coach-text-link">
              Programme history
              <Glyph name="chevronRight" className="glyph-16" />
            </Link>
          </div>
        </Disclosure>
      </section>

      <section
        id="coach-panel-notes"
        role="tabpanel"
        aria-labelledby="coach-tab-notes"
        hidden={tab !== "notes"}
        className="coach-panel"
      >
        <section className="coach-memory-card" aria-labelledby="coach-knows">
          <div className="coach-section-heading">
            <div>
              <h2 id="coach-knows">What the coach remembers</h2>
              <p className="coach-muted">Shared context from your training and feedback.</p>
            </div>
            <Glyph name="book" className="glyph-24" />
          </div>
          {known.length > 0 ? (
            <>
              <ul className="coach-memory-facts">
                {known.slice(0, 3).map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
              {known.length > 3 && (
                <Disclosure summary={`Show ${known.length - 3} more facts`} variant="inline">
                  <ul className="coach-memory-facts">
                    {known.slice(3).map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </>
          ) : (
            <p className="coach-muted">Your coach will build this as you train and share notes.</p>
          )}
          <button
            type="button"
            className="coach-text-link"
            onClick={() => {
              setTab("overview");
              setScope("all");
              requestAnimationFrame(() => textarea.current?.focus());
            }}
          >
            Add or correct something
            <Glyph name="arrowRight" className="glyph-16" />
          </button>
        </section>
        <section aria-labelledby="coach-your-notes">
          <div className="coach-section-heading">
            <div>
              <h2 id="coach-your-notes">Your notes</h2>
              <p className="coach-muted">What you sent and what your coach did with it.</p>
            </div>
          </div>
          <ScopeFilter value={filter} onChange={setFilter} id="notes-scope" />
          <div className="coach-notes-list">
            {notes.filter(inScope).map((note) => (
              <article key={note.id} className="coach-message">
                <div className="coach-message-meta">
                  <span className="coach-scope-label">{scopeName(note.sport)}</span>
                  <span>{note.when}</span>
                </div>
                <p className="coach-message-text">{note.text}</p>
                <p className="coach-note-outcome">
                  <Glyph name={note.outcome ? "check" : "timer"} className="glyph-16" />
                  {note.outcome ?? "Not read yet"}
                </p>
              </article>
            ))}
            {!notes.filter(inScope).length && (
              <p className="coach-empty coach-muted">
                No notes here yet. Use “Tell your coach” to get started.
              </p>
            )}
          </div>
        </section>
        {attempts.length > 0 && (
          <Disclosure summary="Recent coach runs" meta={String(attempts.length)}>
            <ul className="coach-history-list">
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  <strong>
                    {attempt.trigger} · {attempt.status}
                  </strong>
                  <span className="coach-muted">
                    {attempt.when}
                    {attempt.gymName ? ` · ${attempt.gymName}` : ""}
                  </span>
                  {attempt.error && <p>{attempt.error}</p>}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
        <Disclosure summary="How your coach works">
          <p className="coach-muted">
            {workflow
              ? "Each sport has its own programme, session preparation and review. The coach considers your overall training when planning, while requests for a particular programme stay with that programme. You review major changes before they take effect. Started workouts keep their original targets."
              : "Your coach prepares your next session from recent training, check-ins and notes. You can request a new plan from Today."}
          </p>
        </Disclosure>
      </section>
    </div>
  );
}

function ScopeFilter({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="coach-filter">
      <label htmlFor={id}>Show</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All programmes</option>
        {Object.entries(ACTIVITY_SPORT_LABELS).map(([sport, label]) => (
          <option key={sport} value={sport}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
