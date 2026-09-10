"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PLAN_LIMITS } from "@/domain/session-plan";
import { saveCoachNotesAction, setAiCoachEnabledAction } from "@/server/actions/coach";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

type Props = {
  enabled: boolean;
  userNotes: string;
  overview: string;
  overviewUpdatedAt: string | null;
  lastPlan: { generatedAt: string; summary: string; status: string } | null;
  pendingSince: string | null;
};

export function AiCoachSettings({
  enabled,
  userNotes,
  overview,
  overviewUpdatedAt,
  lastPlan,
  pendingSince,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const [state, formAction] = useActionState(saveCoachNotesAction, INITIAL_FORM_STATE);
  const saved =
    state.fieldErrors === undefined && state.formError === undefined && state.values === undefined;

  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      try {
        await setAiCoachEnabledAction(next);
      } catch {
        setError("Could not save. Check your connection and try again.");
      }
    });

  return (
    <div className="space-y-[var(--section-gap)]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="flex items-center gap-1 font-medium">
            AI coach
            <InfoTip label="About the AI coach">
              Every morning at 4 the coach reads your last sessions, check-ins and runs, and writes
              a plan for your next session: the exercises, sets, reps, RIR, loads and warm-up, at
              your default gym. Today shows it, and starting the session uses it. You can ask for a
              fresh plan at another gym from Today. Planning runs on the app owner&apos;s Claude
              account, with your training data only.
            </InfoTip>
          </p>
          <Switch label="AI coach" checked={shown} onChange={change} disabled={pending} />
          {error && (
            <p role="alert" className="w-full text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        {shown && (
          <p className="text-sm text-ink-muted">
            {pendingSince
              ? `The coach is planning now (asked at ${pendingSince}).`
              : lastPlan
                ? `Last plan ${lastPlan.generatedAt}: ${lastPlan.summary}`
                : "No plan yet. The first one arrives after the next overnight run."}
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1 text-base font-medium">
            What the coach knows
            <InfoTip label="About the coach's memo">
              The coach keeps a short memo about you and rewrites it after every plan: goals,
              niggles, how you are progressing, what has been tried. Read it here; correct it below.
            </InfoTip>
          </h2>
          {overviewUpdatedAt && <Badge tone="neutral">{overviewUpdatedAt}</Badge>}
        </div>
        {overview ? (
          <p className="text-sm whitespace-pre-line">{overview}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            Nothing yet. The coach writes this after its first plan.
          </p>
        )}
      </Card>

      <Card>
        <form action={formAction} className="space-y-3">
          <Field
            label="Tell the coach"
            hint="Goals, injuries, what you like or want to avoid. Read before every plan."
          >
            <Textarea
              name="userNotes"
              defaultValue={state.values?.userNotes ?? userNotes}
              maxLength={PLAN_LIMITS.memo}
              placeholder="Left knee is a bit sore on deep squats. Bench matters most to me."
            />
          </Field>
          <FormError message={state.formError} />
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save notes
          </SubmitButton>
          <p className="sr-only" role="status">
            {saved ? "Notes saved" : ""}
          </p>
        </form>
      </Card>
    </div>
  );
}
