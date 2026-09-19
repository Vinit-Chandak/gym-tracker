"use client";

import { AiCoach } from "@/components/ui/icons";
import { useActionState, useOptimistic, useState, useTransition, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Textarea } from "@/components/ui/input";
import { LinkRow, List, Row } from "@/components/ui/link-row";
import { RequestList, type RequestView } from "@/components/coaching/request-list";
import { Section } from "@/components/ui/section";
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
   * One line under the switch, for the two things worth saying: that the coach cannot run on
   * this server, or what it last did on the older single-plan path. A working coach says
   * nothing — the switch already reads "on", and when it plans is not the athlete's business.
   */
  status: string | null;
  noteId: string;
  /** `outcome` is what the coach did with the note, or null while it is still waiting. */
  notes: { id: string; text: string; when: string; outcome: string | null }[];
  overview: string;
  overviewUpdatedAt: string | null;
  /** What the coach has tried lately, so a night it could not plan is not simply silence. */
  attempts: CoachAttempt[];
  /** Requests waiting on one specific answer, asked and answered in the same place. */
  questions?: RequestView[];
  /** How many asks are open in total, so the link to the rest can say so. */
  openRequests?: number;
  /** Coaching links, and anything the coach has concluded lately. */
  children?: ReactNode;
};

/**
 * The coach, on one screen: the switch, what it has been doing, what it knows about you,
 * and the place to tell it things. Boxes of rows and labelled boxes, as every Settings page.
 */
export function AiCoachSettings({
  workflow = false,
  enabled,
  status,
  noteId,
  notes,
  overview,
  overviewUpdatedAt,
  attempts,
  questions = [],
  openRequests = 0,
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
      if (!outcome.ok) setError(outcome.message);
    });

  return (
    <>
      <List>
        <li>
          <div>
            <Row
              icon={AiCoach}
              title={
                <>
                  AI coach
                  <InfoTip label="About the AI coach">
                    {workflow ? (
                      <>
                        The coach writes your programme, prepares each session before you train, and
                        reviews the programme every week. A change to your split or schedule waits
                        for your approval; starting a workout fixes its prescription. It plans from
                        your training data and the reports you attach.
                      </>
                    ) : (
                      <>
                        The coach reads your last sessions, check-ins and runs and writes a plan for
                        your next session at your default gym: exercises, machines, sets, reps, RIR,
                        loads and a warm-up. Today shows it, and starting the session uses it. You
                        can ask for a fresh plan at another gym from Today&apos;s More options.
                      </>
                    )}
                  </InfoTip>
                </>
              }
              subtitle={shown && status ? status : undefined}
            >
              <Switch label="AI coach" checked={shown} onChange={change} disabled={pending} />
            </Row>
            {error && (
              <p role="alert" className="px-4 pb-3 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </li>
      </List>

      {children}

      {questions.length > 0 && (
        <Section
          title="The coach has asked you something"
          info="One question, answered here. Your answer is read at the next daily coach run, which then proposes a change or explains why it cannot."
        >
          <RequestList requests={questions} />
        </Section>
      )}

      {openRequests > questions.length && (
        <List>
          <li>
            <LinkRow
              href="/profile/programme?view=changes"
              title="What you asked for"
              subtitle="Outcomes, proposals and anything still waiting"
              meta={`${openRequests}`}
            />
          </li>
        </List>
      )}

      <Section
        title="What the coach knows"
        info="The coach maintains this memo from your notes and training. It keeps useful preferences, recurring trends, exercise observations and ongoing experiments, up to 3,000 words. To add or correct something, use Tell the coach below."
      >
        <Card>
          {overview ? (
            <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{overview}</p>
          ) : (
            <p className="text-sm text-ink-muted">
              No memo yet. Tell the coach something below; it will remember useful details when it
              next reviews your training.
            </p>
          )}
          {overviewUpdatedAt && (
            <p className="text-xs text-ink-muted tabular-nums">Updated {overviewUpdatedAt}</p>
          )}
        </Card>
        <p className="text-sm text-ink-muted">
          Your profile, goals, programme answers and training history are read separately. They do
          not all need to appear in this memo.
        </p>
      </Section>

      <Section
        title="Tell the coach"
        info="Share a preference, a change, or a correction to something remembered. Notes are read at the next daily coach run: lasting details go in the memo, and anything you have asked the programme to do gets its own outcome under Programme → Changes. Notes you leave on a finished session or on a single exercise reach it the same way."
      >
        <Card>
          <form key={noteId} action={formAction} className="space-y-4">
            <input type="hidden" name="noteId" value={state.values?.noteId ?? noteId} />
            <Field label="Notes for the coach">
              <Textarea
                name="userNotes"
                defaultValue={state.values?.userNotes ?? ""}
                required
                maxLength={PLAN_LIMITS.memo}
                placeholder="Left knee is a bit sore on deep squats. Bench matters most to me."
              />
            </Field>
            <FormError message={state.formError} />
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Send note
            </SubmitButton>
            <p className="text-sm text-ink-muted" role="status">
              {saved ? "Note saved. The coach reads it at its next daily run." : ""}
            </p>
          </form>
        </Card>
        {notes.length > 0 && (
          <List>
            {notes.map((note) => (
              <li key={note.id} className="space-y-1 p-4">
                <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{note.text}</p>
                <p className="text-xs text-ink-muted">
                  {note.when} · {note.outcome ?? "Waiting for the next daily coach run"}
                </p>
              </li>
            ))}
          </List>
        )}
      </Section>

      {attempts.length > 0 && (
        <Section
          title="Recent runs"
          info="Every time the coach tried to plan for you, overnight or because you asked. A failure says what went wrong."
        >
          <List>
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Row
                  title={
                    <>
                      {attempt.trigger}
                      {attempt.status === "failed" && <Badge tone="warning">Failed</Badge>}
                    </>
                  }
                  subtitle={
                    attempt.status === "failed" && attempt.error
                      ? attempt.error
                      : [attempt.gymName, attempt.when].filter(Boolean).join(" · ") || undefined
                  }
                >
                  <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                    {attempt.when.split(",")[0]}
                  </span>
                </Row>
              </li>
            ))}
          </List>
        </Section>
      )}
    </>
  );
}
