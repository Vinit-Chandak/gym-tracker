import { CoachRunDetails } from "@/components/coach-plan";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { runPlanLine } from "@/domain/session-plan";
import { summaryForSport, warningsForSport } from "@/domain/sport-scope";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { TodayPlan } from "@/server/repositories/schedule";
import { SkipPartButton } from "../today/plan-actions";

/** The run occurrence in the shared programme, displayed only in its own sport. */
export function PlannedRun({
  plan,
  coach,
}: {
  plan: TodayPlan | null;
  coach: TodayCoachState | null;
}) {
  const day = plan?.suggestedDay;
  if (!plan || !day?.includesRun || !plan.suggestion) return null;
  // Running targets do not depend on which gym was chosen for the workout.
  const coachPlan = coach?.plan && !coach.pending ? coach.plan : null;
  const run = coachPlan?.run;
  const warnings = run && coachPlan ? warningsForSport(coachPlan.warnings, "run") : [];
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">
            Cycle {plan.suggestion.slot.cycleIndex} · Day {day.dayIndex}
          </p>
          <h2 className="mt-1 text-lg font-medium">Planned run</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {run
              ? runPlanLine(run)
              : plan.runTarget
                ? runSummary(plan.runTarget)
                : "Choose a comfortable pace"}
          </p>
        </div>
        {plan.runStatus === "completed" ? (
          <Badge tone="success">Done</Badge>
        ) : plan.runStatus === "skipped" ? (
          <Badge tone="warning">Skipped</Badge>
        ) : run ? (
          <Badge tone="accent">Coach</Badge>
        ) : null}
      </div>
      {run && coachPlan && (
        <p className="text-sm text-ink-muted">{summaryForSport(coachPlan, "run")}</p>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 text-sm text-warning">
          {warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      )}
      {plan.runStatus === "completed" ? (
        <>
          <p className="text-sm text-ink-muted">Run logged.</p>
          {plan.loggedRunId && (
            <LinkButton href={`/runs/${plan.loggedRunId}`} variant="secondary">
              See the run
            </LinkButton>
          )}
        </>
      ) : plan.runStatus === "skipped" ? (
        <p className="text-sm text-ink-muted">Run skipped.</p>
      ) : (
        <>
          <LinkButton
            href={plan.runTarget ? `/runs/new?planned=${plan.runTarget.id}` : "/runs/new"}
            size="lg"
            className="w-full"
          >
            Log run
          </LinkButton>
          <SkipPartButton
            dayIndex={day.dayIndex}
            part="run"
            title="Skip this run?"
            label="Skip run"
          />
        </>
      )}
      {coach?.pending && (
        <p className="text-sm text-ink-muted">
          The coach is preparing this session. The programme targets are shown for now.
        </p>
      )}
      {run ? (
        <Disclosure summary="How to run it" variant="footer">
          <CoachRunDetails run={run} programme={plan.runTarget} />
        </Disclosure>
      ) : plan.runTarget && hasRunGuidance(plan.runTarget) ? (
        <Disclosure summary="How to run it" variant="footer">
          <RunPlanDetails run={plan.runTarget} />
        </Disclosure>
      ) : null}
    </Card>
  );
}
