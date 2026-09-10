"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useOptimistic, useState, useTransition } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Textarea } from "@/components/ui/input";
import { List, Row } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { PLAN_LIMITS } from "@/domain/session-plan";
import { saveCoachNotesAction, setAiCoachEnabledAction } from "@/server/actions/coach";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

type Props = {
  enabled: boolean;
  /** One line under the switch: what the coach last did, or why it cannot do anything yet. */
  status: string;
  userNotes: string;
  overview: string;
  overviewUpdatedAt: string | null;
};

/**
 * The coach, on one screen: the switch with its standing, what the coach knows about you,
 * and the place to tell it things. Boxes of rows and labelled boxes, as every Settings page.
 */
export function AiCoachSettings({
  enabled,
  status,
  userNotes,
  overview,
  overviewUpdatedAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);
  const [state, formAction] = useActionState(saveCoachNotesAction, INITIAL_FORM_STATE);
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

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
    <>
      <List>
        <li>
          <div>
            <Row
              icon={Sparkles}
              title={
                <>
                  AI coach
                  <InfoTip label="About the AI coach">
                    Every morning at four the coach reads your last sessions, check-ins and runs and
                    writes a plan for your next session at your default gym: exercises, machines,
                    sets, reps, RIR, loads and a warm-up. Today shows it, and starting the session
                    uses it. You can ask for a fresh plan at another gym from Today&apos;s More
                    options. Planning runs on the app owner&apos;s Claude account, with your
                    training data only.
                  </InfoTip>
                </>
              }
              subtitle={shown ? status : undefined}
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

      <Section
        title="What the coach knows"
        info="The coach keeps a short memo about you and rewrites it after every plan: goals, niggles, how you are progressing, what has been tried. Read it here; correct it below."
      >
        <Card>
          {overview ? (
            <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{overview}</p>
          ) : (
            <p className="text-sm text-ink-muted">
              Nothing yet. The coach writes this after its first plan.
            </p>
          )}
          {overviewUpdatedAt && (
            <p className="text-xs text-ink-muted tabular-nums">Updated {overviewUpdatedAt}</p>
          )}
        </Card>
      </Section>

      <Section
        title="Tell the coach"
        info="Goals, injuries, what you like or want to avoid. The coach reads this before every plan."
      >
        <Card>
          <form action={formAction} className="space-y-4">
            <Field label="Notes for the coach">
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
      </Section>
    </>
  );
}
