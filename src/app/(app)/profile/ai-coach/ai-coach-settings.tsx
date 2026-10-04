"use client";

import { useActionState, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { FormError } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { Switch } from "@/components/ui/switch";
import { PLAN_LIMITS } from "@/domain/plan-limits";
import { attempted, keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveCoachNotesAction, setAiCoachEnabledAction } from "@/server/actions/coach";
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
  workflow?: boolean;
  enabled: boolean;
  /**
   * One line under the title, for the two things worth saying: that the coach cannot run on
   * this server, or what it last did on the older single-plan path. A working coach says
   * nothing — the switch already reads "on", and when it plans is not the athlete's business.
   */
  status: string | null;
  noteId: string;
  /** `outcome` is what the coach did with the note, or null while it is still waiting. */
  notes: { id: string; text: string; when: string; outcome: string | null }[];
  overview: string;
  /** What the coach has tried lately, so a night it could not plan is not simply silence. */
  attempts: CoachAttempt[];
  /** What waits on the athlete: a question to answer, a change to decide on. */
  waiting?: ReactNode;
  /** Anything the coach could not do lately. */
  children?: ReactNode;
};

/**
 * The coach, on one screen (board AI coach): its name and its switch; what waits on you, a
 * question to answer and a change to decide on; what it knows about you; what you have told
 * it and what became of each; and, pinned at the foot, the place to tell it more.
 */
export function AiCoachSettings({
  workflow = false,
  enabled,
  status,
  noteId,
  notes,
  overview,
  attempts,
  waiting,
  children,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveCoachNotesAction),
    INITIAL_FORM_STATE,
  );
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      const outcome = await attempted(
        () => setAiCoachEnabledAction(next),
        "Could not save. Check your connection and try again.",
      );
      // As in the privacy switches: after an await an update is no longer the transition's
      // own, so the error is marked as one to arrive with the switch going back.
      if (!outcome.ok) startTransition(() => setError(outcome.message));
    });
  const known = overview ? memoLines(overview) : [];

  return (
    <>
      <div className="coach-title">
        <h1 className="flex min-w-0 items-center gap-1 type-display">
          AI coach
          <InfoTip label="About the AI coach">
            {workflow ? (
              <>
                The coach writes your programme, prepares each session before you train, and reviews
                the programme every week. A change to your split or schedule waits for your
                approval; starting a workout fixes its prescription. It plans from your training
                data and the reports you attach.
              </>
            ) : (
              <>
                The coach reads your last sessions, check-ins and runs and writes a plan for your
                next session at your default gym: exercises, machines, sets, reps, RIR, loads and a
                warm-up. Today shows it, and starting the session uses it. You can ask for a fresh
                plan at another gym from Today&apos;s More options.
              </>
            )}
          </InfoTip>
        </h1>
        <Switch label="AI coach" checked={shown} onChange={change} disabled={pending} />
      </div>
      {shown && status && <p className="type-meta text-ink-2">{status}</p>}
      {error && (
        <p role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}

      {waiting}
      {children}

      <section aria-labelledby="coach-knows">
        <h2 id="coach-knows" className="caption-head mt-4.5 flex items-center gap-1">
          What the coach knows
          <InfoTip label="About what the coach knows">
            What the coach keeps from your notes and training. To add or correct something, tell the
            coach below.
          </InfoTip>
        </h2>
        {/* One fact a line in the list it is, read as the paragraph it makes. */}
        {known.length > 0 ? (
          <ul className="coach-knows">
            {known.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 type-meta text-ink-2">Nothing yet.</p>
        )}
      </section>

      {notes.length > 0 && (
        <section aria-labelledby="coach-told">
          <h2 id="coach-told" className="caption-head mt-4.5 flex items-center gap-1">
            Tell the coach
            <InfoTip label="About telling the coach">
              Read at the next daily coach run. Anything you ask the programme to do gets its answer
              under Programme → Changes.
            </InfoTip>
          </h2>
          <ul>
            {notes.map((note) => (
              <li key={note.id} className="coach-note">
                <p className="coach-note-text">{note.text}</p>
                <p className="type-caption font-medium text-ink-2">
                  {note.outcome ?? "Not read yet"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attempts.length > 0 && (
        <section aria-labelledby="coach-runs">
          <h2 id="coach-runs" className="caption-head mt-4.5 flex items-center gap-1">
            Recent runs
            <InfoTip label="About recent runs">
              Every time the coach tried to plan for you, overnight or because you asked. A failure
              says what went wrong.
            </InfoTip>
          </h2>
          <ul>
            {attempts.map((attempt) => (
              <li key={attempt.id} className="coach-note">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="coach-note-text">
                    {attempt.trigger}
                    {attempt.status === "failed" && " · Failed"}
                  </span>
                  <span className="shrink-0 type-caption text-ink-2 tabular-nums">
                    {attempt.when.split(",")[0]}
                  </span>
                </p>
                <p className="type-caption font-medium [overflow-wrap:anywhere] text-ink-2">
                  {attempt.status === "failed" && attempt.error
                    ? attempt.error
                    : [attempt.gymName, attempt.when].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Telling the coach is always at hand: pinned over the tabs, the note's words and Send. */}
      <PinnedActions stack>
        <form key={noteId} action={formAction}>
          <input type="hidden" name="noteId" value={state.values?.noteId ?? noteId} />
          <div className="coach-compose" data-field-error={state.formError ? "true" : undefined}>
            <label htmlFor="coach-note" className="sr-only">
              Notes for the coach
            </label>
            <textarea
              id="coach-note"
              name="userNotes"
              rows={1}
              defaultValue={state.values?.userNotes ?? ""}
              required
              maxLength={PLAN_LIMITS.memo}
              placeholder="Notes for the coach"
              className="coach-compose-input"
            />
            <SendNote />
          </div>
          <FormError message={state.formError} />
          <p className="sr-only" role="status">
            {saved ? "Saved." : ""}
          </p>
        </form>
      </PinnedActions>
    </>
  );
}

/** Send, as a glyph: waiting grey while a note is on its way. */
function SendNote() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={pending ? "Saving…" : "Send note"}
      disabled={pending}
      className="coach-compose-send"
    >
      <Glyph name="send" className="glyph-20" />
    </button>
  );
}

/**
 * The memo as a list, one fact a line.
 *
 * The stored overview prefixes each fact with its category — "preference: …", "trend: …" —
 * which is how the coach files them and nothing an athlete needs to read.
 */
function memoLines(overview: string): string[] {
  return overview
    .split("\n")
    .map((line) =>
      line.replace(/^(preference|trend|observation|experiment|decision):\s*/i, "").trim(),
    )
    .filter(Boolean);
}
