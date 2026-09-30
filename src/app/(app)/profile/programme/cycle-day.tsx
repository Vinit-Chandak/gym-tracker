import { ChevronDown } from "@/components/ui/icons";

import { DayChip, dayKind } from "@/components/coaching/day-chip";
import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { hasRunGuidance, RunPlanDetails } from "@/components/run-plan";
import { Badge } from "@/components/ui/badge";
import { DetailList } from "@/components/ui/detail-list";
import { rangeLabel, SLOT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

/** What the day is, on one line under its name. */
function subtitle(day: ScheduleDay): string | null {
  const parts = [day.focus, day.timeNote].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "5 km, 25–30 min, effort 1–2": the run as a phrase, like every other meta line. */
function runLine(plan: ProgramDayPlan): string | null {
  const run = plan.run;
  if (!run) return null;
  return [
    run.distanceMinKm === null
      ? null
      : rangeLabel(run.distanceMinKm, run.distanceMaxKm ?? run.distanceMinKm, " km"),
    rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min"),
    run.rpeMin === null || run.rpeMin === undefined
      ? null
      : `effort ${rangeLabel(run.rpeMin, run.rpeMax ?? run.rpeMin)}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * What it asks for: the sets, the run, or neither. The run keeps a line of its own in
 * running's colour, so a day that does both reads as both.
 */
function Cost({ plan }: { plan: ProgramDayPlan }) {
  const run = runLine(plan);
  if (plan.exercises.length === 0 && !run)
    return <p className="mt-0.5 text-sm text-ink-subtle">Rest day</p>;
  return (
    <>
      {plan.exercises.length > 0 && (
        <p className="mt-0.5 text-sm text-ink-subtle tabular-nums">{planSummary(plan.exercises)}</p>
      )}
      {run && <p className="mt-0.5 text-sm text-run-ink tabular-nums">Run {run}</p>}
    </>
  );
}

const HEAD = "flex min-h-16 items-start gap-3 px-4 py-3";

/**
 * One day of the cycle: a row in the cycle's box, opening in place on to everything the day
 * prescribes. Its number sits on its kind's colour, so lifting, running and rest days are
 * told apart down the list before a name is read.
 *
 * A native <details>, so a seven-day cycle sends no JavaScript to the browser and costs
 * nothing until a day is opened. A day with nothing to open — a plain rest day — is the
 * same row without the fold, rather than a control that does nothing.
 */
export function CycleDay({ plan }: { plan: ProgramDayPlan }) {
  const { day } = plan;
  const guidance = Boolean(plan.run && hasRunGuidance(plan.run));
  const extras = Boolean(plan.warmupName || day.effortNote || day.notes);
  const expandable = plan.exercises.length > 0 || guidance || extras;

  const head = (
    <>
      <DayChip index={day.dayIndex} kind={dayKind(day)} />
      <div className="min-w-0 flex-1 self-center">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold [overflow-wrap:anywhere]">{day.name}</p>
          {plan.isNext ? (
            <Badge tone="accent">Next</Badge>
          ) : plan.status === "completed" || plan.status === "skipped" ? (
            <Badge tone={plan.status === "completed" ? "success" : "warning"}>
              {SLOT_STATUS_LABELS[plan.status]}
            </Badge>
          ) : null}
        </div>
        {subtitle(day) && (
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{subtitle(day)}</p>
        )}
        <Cost plan={plan} />
      </div>
      {expandable && (
        <ChevronDown
          className="mt-3 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
          aria-hidden
        />
      )}
    </>
  );

  if (!expandable) return <div className={HEAD}>{head}</div>;

  return (
    <details className="group min-w-0">
      <summary
        className={cn(
          HEAD,
          "list-none transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-2 active:bg-surface-raised",
        )}
      >
        {head}
      </summary>
      <div className="space-y-4 pr-4 pb-4 pl-[4.5rem]">
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
