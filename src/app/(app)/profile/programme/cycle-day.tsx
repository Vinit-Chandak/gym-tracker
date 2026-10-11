import { ChevronDown } from "@/components/ui/icons";

import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { Badge } from "@/components/ui/badge";
import { DetailList } from "@/components/ui/detail-list";
import type { SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

/** What the day is, on one line under its name, its time held whole ("60–75 min"). */
function subtitle(day: ScheduleDay): string | null {
  return joinFacts([day.focus, day.timeNote && holdFigures(day.timeNote)]) || null;
}

/** What it asks for: the sets, or the run in the athlete's road unit, or neither. */
function cost(plan: ProgramDayPlan, units: SportUnits): string {
  if (plan.exercises.length > 0)
    return [planSummary(plan.exercises), plan.run ? `Run: ${runSummary(plan.run, units)}` : null]
      .filter(Boolean)
      .join(FACT_SEPARATOR);
  if (plan.run) return runSummary(plan.run, units);
  return "Rest day";
}

/* The chevron stands beside the name only, so what the day is and asks for take the box's whole
   width under it. */
const HEAD = "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3";

/**
 * One day of the cycle: its own box, opening on to everything the day prescribes.
 *
 * A native <details>, so a seven-day cycle sends no JavaScript to the browser and costs
 * nothing until a day is opened. A day with nothing to open — a plain rest day — is the
 * same box without the fold, rather than a control that does nothing. `open` is a day whose
 * workout is under way, which is in progress rather than next.
 */
export function CycleDay({
  plan,
  units,
  open = false,
}: {
  plan: ProgramDayPlan;
  units: SportUnits;
  open?: boolean;
}) {
  const { day } = plan;
  const guidance = Boolean(plan.run && hasRunGuidance(plan.run));
  const extras = Boolean(plan.warmupName || day.effortNote || day.notes);
  const expandable = plan.exercises.length > 0 || guidance || extras;

  const head = (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
          !expandable && "col-span-full",
        )}
      >
        <p className="min-w-0 font-medium [overflow-wrap:break-word]">{day.name}</p>
        {open ? (
          <Badge tone="accent">In progress</Badge>
        ) : plan.isNext ? (
          <Badge tone="accent">Next</Badge>
        ) : plan.status === "completed" || plan.status === "skipped" ? (
          <Badge tone={plan.status === "completed" ? "success" : "warning"}>
            {SLOT_STATUS_LABELS[plan.status]}
          </Badge>
        ) : null}
      </div>
      {expandable && (
        <ChevronDown
          className="mt-1 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
          aria-hidden
        />
      )}
      {subtitle(day) && (
        <p className="col-span-full mt-0.5 text-sm text-ink-muted">{subtitle(day)}</p>
      )}
      <p className="col-span-full mt-1 text-xs text-ink-muted tabular-nums">{cost(plan, units)}</p>
    </>
  );

  if (!expandable) return <div className={cn("box", HEAD)}>{head}</div>;

  return (
    <details className="group box min-w-0">
      {/* The day answers a press with its tint, not the controls' 0.97: at large text the head
          is hundreds of points tall, and shrinking it took its rounded corner out from under a
          thumb pressed near it, so the press landed on the card and the day stayed shut. */}
      <summary
        className={cn(
          HEAD,
          "list-none rounded-card transition-colors duration-[var(--ov-duration-feedback)] group-open:rounded-b-none active:scale-100 active:bg-surface-raised",
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
