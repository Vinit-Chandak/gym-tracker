"use client";

import { AiCoach } from "@/components/ui/icons";
import { useActionState, useOptimistic, useState, useTransition, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Textarea } from "@/components/ui/input";
import { List, Row } from "@/components/ui/link-row";
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
  notes: { id: string; text: string; when: string; reviewed: boolean }[];
  overview: string;
  overviewUpdatedAt: string | null;
  /** What the coach has tried lately, so a night it could not plan is not simply silence. */
  attempts: CoachAttempt[];
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
        info="Share a preference, a change, or a correction to something remembered. Each note is saved. At its next planning or review, the coach reads your notes and keeps the important, lasting details in the memo."
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
              {saved ? "Note saved. The coach will review it before its next plan." : ""}
            </p>
          </form>
        </Card>
        {notes.length > 0 && (
          <List>
            {notes.map((note) => (
              <li key={note.id} className="space-y-1 p-4">
                <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{note.text}</p>
                <p className="text-xs text-ink-muted">
                  {note.when} · {note.reviewed ? "Reviewed by coach" : "Waiting for coach"}
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
