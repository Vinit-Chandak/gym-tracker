import { ChevronDown } from "@/components/ui/icons";

import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { Badge } from "@/components/ui/badge";
import { DetailList } from "@/components/ui/detail-list";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

/** What the day is, on one line under its name. */
function subtitle(day: ScheduleDay): string | null {
  const parts = [day.focus, day.timeNote].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What it asks for: the sets, or the run, or neither. */
function cost(plan: ProgramDayPlan): string {
  if (plan.exercises.length > 0)
    return [planSummary(plan.exercises), plan.run ? `Run: ${runSummary(plan.run)}` : null]
      .filter(Boolean)
      .join(" · ");
  if (plan.run) return runSummary(plan.run);
  return "Rest day";
}

const HEAD = "flex min-h-14 items-start gap-3 px-4 py-3";

/**
 * One day of the cycle: its own box, opening on to everything the day prescribes.
 *
 * A native <details>, so a seven-day cycle sends no JavaScript to the browser and costs
 * nothing until a day is opened. A day with nothing to open — a plain rest day — is the
 * same box without the fold, rather than a control that does nothing.
 */
export function CycleDay({ plan }: { plan: ProgramDayPlan }) {
  const { day } = plan;
  const guidance = Boolean(plan.run && hasRunGuidance(plan.run));
  const extras = Boolean(plan.warmupName || day.effortNote || day.notes);
  const expandable = plan.exercises.length > 0 || guidance || extras;

  const head = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium [overflow-wrap:anywhere]">{day.name}</p>
          {plan.isNext ? (
            <Badge tone="accent">Next</Badge>
          ) : plan.status === "completed" || plan.status === "skipped" ? (
            <Badge tone={plan.status === "completed" ? "success" : "warning"}>
              {SLOT_STATUS_LABELS[plan.status]}
            </Badge>
          ) : null}
        </div>
        {subtitle(day) && <p className="mt-0.5 text-sm text-ink-muted">{subtitle(day)}</p>}
        <p className="mt-1 text-xs text-ink-muted tabular-nums">{cost(plan)}</p>
      </div>
      {expandable && (
        <ChevronDown
          className="mt-1 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
          aria-hidden
        />
      )}
    </>
  );

  if (!expandable) return <div className={cn("box", HEAD)}>{head}</div>;

  return (
    <details className="group box min-w-0">
      <summary
        className={cn(
          HEAD,
          "list-none rounded-card transition-colors duration-[var(--ov-duration-feedback)] group-open:rounded-b-none active:bg-surface-raised",
        )}
      >
        {head}
      </summary>
      <div className="space-y-4 border-t border-line px-4 pt-3 pb-4">
        {plan.exercises.length > 0 && <PlannedExerciseList exercises={plan.exercises} />}
        {plan.run && hasRunGuidance(plan.run) && <RunPlanDetails run={plan.run} />}
        <DetailList
          entries={[
            ["Warm-up", plan.warmupName],
            ["Effort", day.effortNote],
            ["Notes", day.notes],
          ]}
        />
      </div>
    </details>
  );
}
