"use client";

import { useActionState, useOptimistic, useRef, useState, useTransition } from "react";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError, useKeptForm } from "@/components/ui/form";
import { SavedNotice } from "@/components/ui/saved-notice";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Textarea } from "@/components/ui/input";
import { NavRow } from "@/components/ui/nav-row";
import { Section } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { ACTIVITY_SPORTS, ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { PLAN_LIMITS } from "@/domain/plan-limits";
import { joinFacts } from "@/lib/facts";
import { attempted, keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveCoachNotesAction, setAiCoachEnabledAction } from "@/server/actions/coach";
import type { CoachDashboard } from "@/server/repositories/coach-dashboard";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export type CoachAttempt = {
  id: string;
  when: string;
  trigger: string;
  status: string;
  gymName: string | null;
  error: string | null;
};

type Props = {
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
};

type Job = CoachDashboard["jobs"][number];

/** What a request to the coach is for, by the name Plan gives it ("New running programme"). */
function jobName(job: Job): string {
  const sport = ACTIVITY_SPORT_LABELS[job.sport];
  if (job.kind === "create_program") return `New ${sport.toLowerCase()} ${job.scope}`;
  if (job.kind === "review_program") return `${sport} programme`;
  return `Next ${sport.toLowerCase()} session`;
}

/**
 * Where a request stands, in the words Plan's card and the request's page use: a new programme
 * is being written, as Plan says it, however long it waits; a review or a session preparation
 * that nothing will pick up before the night says so rather than claiming to be under way.
 */
function jobState(job: Job): string {
  if (job.status === "needs_input") return "Needs your answer";
  if (job.status === "failed") return "Could not finish";
  if (job.kind === "create_program") return "Being written";
  if (job.progress === "waiting") return "Not started yet";
  return job.kind === "review_program" ? "Being reviewed" : "Being prepared";
}

/** The coach's output waiting on the athlete, in the three states every screen names it by. */
const STATES = ["Needs your answer", "Changes to review", "New programme to review"] as const;
type State = (typeof STATES)[number];
type WaitingRow = { key: string; label: string; state: string; href: Route };

/**
 * What waits for the athlete, one row per programme naming only its state: the decisions
 * themselves are the programme's page's (ADR 0058), which the row opens. A first programme, or
 * a session, the coach wrote for a sport with no programme yet has no page to open, so its row
 * opens its review, as Plan's card for it does. The athlete's own drafts are theirs, listed on
 * the programme's page, and not the coach's to report here.
 */
function waitingFor(dashboard: CoachDashboard): WaitingRow[] {
  const active = new Set(dashboard.programmes.map((programme) => programme.sport));
  const states = new Map<ActivitySport, Set<State>>();
  const add = (sport: ActivitySport, state: State) =>
    states.set(sport, new Set(states.get(sport)).add(state));
  const drafts: WaitingRow[] = [];
  for (const request of dashboard.requests)
    if (request.state === "needs_answer") add(request.sport ?? "strength", "Needs your answer");
  // Proposals from before drafts were strength's alone, applied on its page.
  if (dashboard.legacy.length > 0) add("strength", "Changes to review");
  for (const proposal of dashboard.proposals) {
    if (!proposal.fromCoach) continue;
    if (proposal.kind === "change") add(proposal.sport, "Changes to review");
    else if (proposal.kind === "programme" && active.has(proposal.sport))
      add(proposal.sport, "New programme to review");
    else {
      const sport = ACTIVITY_SPORT_LABELS[proposal.sport];
      const session = proposal.kind === "session";
      drafts.push({
        key: proposal.id,
        label: `${sport} ${session ? "session" : "programme"}`,
        state: session ? "Session to review" : "New programme to review",
        href: `/plan/drafts/${proposal.id}` as Route,
      });
    }
  }
  return [
    ...ACTIVITY_SPORTS.flatMap((sport) => {
      const held = states.get(sport);
      if (!held) return [];
      return [
        {
          key: sport,
          label: `${ACTIVITY_SPORT_LABELS[sport]} programme`,
          state: joinFacts(STATES.filter((state) => held.has(state))),
          // The strength programme keeps what waits under its Changes tab.
          href: (sport === "strength" ? "/plan/strength?view=changes" : `/plan/${sport}`) as Route,
        },
      ];
    }),
    ...drafts,
  ];
}

/**
 * The AI coach, in one column (ADR 0058): its switch, what it is working on, which programmes
 * wait for you, notes for every programme at once, what it remembers and what you have told it,
 * and its access tokens. A programme's own requests, changes and history are its page's; this
 * page names each programme only by its state and links to it.
 */
export function AiCoachSettings({
  enabled,
  status,
  noteId,
  notes,
  overview,
  attempts,
  dashboard,
}: Props) {
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
    setFresh({ id: crypto.randomUUID(), after: state });
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
  const scopeName = (sport: ActivitySport | null | undefined) =>
    sport ? ACTIVITY_SPORT_LABELS[sport] : "Every programme";
  const jobs = dashboard?.jobs ?? [];
  const waiting = dashboard ? waitingFor(dashboard) : [];
  const known = overview
    .split("\n")
    .map((line) =>
      line.replace(/^(preference|trend|observation|experiment|decision):\s*/i, "").trim(),
    )
    .filter(Boolean);

  return (
    <div className="coach-hub">
      {/* Its title, how it works a tap away, and the switch, which is its state. */}
      <header className="coach-hub-heading">
        <div className="flex items-center gap-1">
          <h1 className="type-display">AI coach</h1>
          <InfoTip label="How the AI coach works">
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
      <FormError message={error ?? undefined} />

      {(jobs.length > 0 || attempts.length > 0) && (
        <Section title="Working on">
          {jobs.length > 0 && (
            <ul className="ov-panel ov-panel-list">
              {jobs.map((job) => (
                // What failed is said in plain words; the request's page offers the way on.
                <NavRow
                  key={job.id}
                  href={`/plan/requests/${job.id}` as Route}
                  label={jobName(job)}
                  sub={jobState(job)}
                />
              ))}
            </ul>
          )}
          {attempts.length > 0 && (
            // In the athlete's words; what the coach or the server wrote stays under Details.
            <Disclosure summary="Coach activity" meta={String(attempts.length)}>
              <ul className="ruled-list">
                {attempts.map((attempt) => (
                  <li key={attempt.id} className="min-w-0 py-2 text-sm [overflow-wrap:break-word]">
                    <p className="font-medium">
                      {attempt.trigger} · {attempt.status}
                    </p>
                    <p className="text-ink-2 tabular-nums">
                      {joinFacts([attempt.when, attempt.gymName])}
                    </p>
                    {attempt.error && (
                      <Disclosure summary="Details" variant="inline">
                        <p className="[overflow-wrap:break-word] text-ink-2">{attempt.error}</p>
                      </Disclosure>
                    )}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Waiting for you">
          <ul className="ov-panel ov-panel-list">
            {waiting.map((row) => (
              <NavRow key={row.key} href={row.href} label={row.label} sub={row.state} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Notes for every programme">
        <form ref={form} action={formAction} className="box space-y-3 panel-padding">
          <input type="hidden" name="noteId" value={state.values?.noteId ?? fresh.id} />
          {/* The heading names it; a programme's own asks are its page's Request a change. */}
          <Field label="Notes for every programme" labelHidden error={state.fieldErrors?.userNotes}>
            <Textarea
              key={fresh.id}
              ref={textarea}
              name="userNotes"
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              required
              maxLength={PLAN_LIMITS.memo}
              disabled={sending}
              placeholder="I have less time next week."
            />
          </Field>
          <FormError message={state.formError ?? state.fieldErrors?.sport} />
          <Button type="submit" disabled={sending || !text.trim()} className="w-full">
            <Glyph name="send" className="glyph-18" />
            {sending ? "Sending…" : "Send"}
          </Button>
          {saved && !text && <SavedNotice key={fresh.id}>Note sent.</SavedNotice>}
        </form>
      </Section>

      {/* Folds side by side are rows of one card, one rule between them, never a stack of
          boxes. */}
      <ul className="ov-panel ov-panel-list">
        <li>
          <Disclosure
            summary="What the coach remembers"
            meta={String(known.length)}
            variant="inline"
            className="border-t-0"
          >
            {known.length > 0 ? (
              <ul className="ruled-list">
                {known.map((line, index) => (
                  <li key={index} className="py-2 text-sm [overflow-wrap:break-word]">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-ink-2">Nothing yet.</p>
            )}
            <button
              type="button"
              className="flex min-h-[var(--ov-target)] items-center gap-1.5 text-sm font-semibold"
              onClick={() => textarea.current?.focus()}
            >
              Add or correct something
              <Glyph name="arrowRight" className="glyph-16 shrink-0" />
            </button>
          </Disclosure>
        </li>
        <li>
          <Disclosure
            summary="Your notes"
            meta={String(notes.length)}
            variant="inline"
            className="border-y-0"
          >
            {notes.length > 0 ? (
              <ul className="ruled-list">
                {notes.map((note) => (
                  <li key={note.id} className="min-w-0 space-y-1 py-2 text-sm">
                    <p className="text-xs text-ink-2 tabular-nums">
                      {joinFacts([scopeName(note.sport), note.when])}
                    </p>
                    <p className="[overflow-wrap:break-word] whitespace-pre-wrap">{note.text}</p>
                    <p className="flex items-start gap-1.5 text-xs [overflow-wrap:break-word] text-ink-2">
                      <Glyph
                        name={note.outcome ? "check" : "timer"}
                        className="mt-px glyph-16 shrink-0"
                      />
                      {note.outcome ?? "Not read yet"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-ink-2">No notes yet.</p>
            )}
          </Disclosure>
        </li>
      </ul>

      {/* Read-only access for a coach of the athlete's own: the coach's, so it is here. */}
      <ul className="ov-panel ov-panel-list">
        <NavRow href="/profile/coach" glyph="key" label="Access tokens" />
      </ul>
    </div>
  );
}
