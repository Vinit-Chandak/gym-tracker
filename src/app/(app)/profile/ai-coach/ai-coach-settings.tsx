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
import { InfoTip } from "@/components/ui/info-tip";
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
  const recentChanges = dashboard?.recentChanges.filter(inScope) ?? [];
  const known = overview
    .split("\n")
    .map((line) =>
      line.replace(/^(preference|trend|observation|experiment|decision):\s*/i, "").trim(),
    )
    .filter(Boolean);
  const waiting = dashboard?.waiting ?? 0;
  const failed = dashboard?.jobs.filter((job) => job.status === "failed").length ?? 0;

  return (
    <div className="coach-hub">
      {/* Its title, what turning it off does a tap away, and the switch, which is its state. */}
      <header className="coach-hub-heading">
        <div className="flex items-center gap-1">
          <h1 className="type-display">AI coach</h1>
          <InfoTip label="About the AI coach">
            Off pauses planning and reviews; your programmes and notes stay. Changes the coach
            proposes wait for your approval.
          </InfoTip>
        </div>
        <div className="coach-power">
          <Switch label="AI coach" checked={shown} onChange={change} disabled={pending} />
        </div>
      </header>
      {shown && status && (
        <p className="coach-notice" role="status">
          {status}
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
        {children}
        {!!dashboard?.jobs.length && (
          <Disclosure
            summary="Coach activity"
            meta={
              failed > 0 ? `${failed} could not finish` : `${dashboard.jobs.length} in progress`
            }
          >
            <ul className="coach-history-list">
              {dashboard.jobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/plan/requests/${job.id}` as Route}>
                    <span className="coach-scope-label">{scopeName(job.sport)}</span>
                    {/* What failed, in plain words, and the way on: the request page offers it. */}
                    <strong>
                      {job.status === "failed"
                        ? `The coach could not finish ${
                            job.kind === "create_program"
                              ? `your ${job.scope}`
                              : job.kind === "review_program"
                                ? "reviewing your programme"
                                : "preparing your next session"
                          }`
                        : job.kind === "create_program"
                          ? `Creating a ${job.scope}`
                          : job.kind === "review_program"
                            ? "Reviewing your programme"
                            : "Preparing your next session"}
                    </strong>
                    <span className="coach-muted">
                      {job.status === "failed"
                        ? "Try again"
                        : job.status === "needs_input"
                          ? "Needs your input"
                          : job.progress === "waiting"
                            ? "Waiting"
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
            <h2 id="tell-coach">Tell your coach</h2>
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
                >
                  <option value="all">All my programmes</option>
                  {programmes.map((programme) => (
                    <option key={programme.id} value={programme.sport}>
                      {ACTIVITY_SPORT_LABELS[programme.sport]} · {programme.name}
                    </option>
                  ))}
                </select>
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
                    ? "I have less time next week."
                    : "Move Thursday’s session to Friday."
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
              <Button type="submit" disabled={sending || !text.trim()} className="ml-auto">
                <Glyph name="send" className="glyph-18" />
                {sending ? "Sending…" : "Send note"}
              </Button>
            </div>
            <p className="coach-saved" role="status">
              {saved && !text ? "Note sent." : ""}
            </p>
          </form>
        </section>
        {workflow && (
          <div className="coach-quick-links">
            <Link href="/profile/programme/create">
              <Glyph name="sliders" className="glyph-20" />
              {/* Named for what its page does: it asks the coach for a strength programme. */}
              <span>New strength programme</span>
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
        {/* The tab names the panel: no heading repeats it. */}
        <ScopeFilter value={filter} onChange={setFilter} id="requests-scope" />
        {/* The coach asking something, whether of a programme's brief or of an ask: one name. */}
        {needsInput.length + questions.length > 0 && (
          <section className="coach-group">
            <h3>
              Needs your answer{" "}
              <span className="coach-count">{needsInput.length + questions.length}</span>
            </h3>
            {needsInput.length > 0 && (
              <ul className="coach-change-list">
                {needsInput.map((job) => (
                  <li key={job.id}>
                    <Link href={`/plan/requests/${job.id}` as Route} className="coach-change-row">
                      <span>
                        <span className="coach-scope-label">{scopeName(job.sport)}</span>
                        <strong>Finish your {job.scope} brief</strong>
                      </span>
                      <Glyph name="chevronRight" className="glyph-20" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
                        ? `/plan/${proposal.sport}/edit?draft=${proposal.id}`
                        : `/plan/drafts/${proposal.id}`) as Route
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
            </div>
          )}
        {(withCoach.length > 0 || recentChanges.length > 0) && (
          // Folds side by side are ruled rows that share their rules, never a stack of boxes.
          <ul className="[&>li+li]:-mt-px">
            {withCoach.length > 0 && (
              <li>
                <Disclosure
                  summary="With the coach"
                  meta={String(withCoach.length)}
                  variant="inline"
                >
                  <div className="coach-group">
                    {withCoach.map((request) => (
                      <div key={request.id} className="coach-scoped-request">
                        <p className="coach-scope-label">{scopeName(request.sport)}</p>
                        <RequestList requests={[request]} />
                      </div>
                    ))}
                  </div>
                </Disclosure>
              </li>
            )}
            {recentChanges.length > 0 && (
              <li>
                <Disclosure
                  summary="Updated by the coach"
                  meta={String(recentChanges.length)}
                  variant="inline"
                >
                  <ul className="coach-history-list">
                    {recentChanges.map((item) => (
                      <li key={item.id}>
                        <Link href={`/plan/drafts/${item.id}` as Route}>
                          <span className="coach-scope-label">{scopeName(item.sport)}</span>
                          <strong>{item.title}</strong>
                          <span className="coach-muted">Applied · {item.when}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              </li>
            )}
          </ul>
        )}
        {/* Every sport's settled requests and changes have one home: the history page. */}
        <Link href="/plan/history" className="coach-text-link">
          Past requests and changes
          <Glyph name="chevronRight" className="glyph-16" />
        </Link>
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
            <h2 id="coach-knows">What the coach remembers</h2>
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
                <Disclosure summary={`${known.length - 3} more`} variant="inline">
                  <ul className="coach-memory-facts">
                    {known.slice(3).map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </>
          ) : (
            <p className="coach-muted">Nothing yet.</p>
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
            <h2 id="coach-your-notes">Your notes</h2>
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
              <p className="coach-empty coach-muted">No notes yet.</p>
            )}
          </div>
        </section>
        {attempts.length > 0 && (
          // The same name as the coach's work under the programmes, in the athlete's words;
          // what the coach or the server wrote stays under Details.
          <Disclosure summary="Coach activity" meta={String(attempts.length)}>
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
                  {attempt.error && (
                    <Disclosure summary="Details" variant="inline">
                      <p className="coach-muted [overflow-wrap:break-word]">{attempt.error}</p>
                    </Disclosure>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
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
