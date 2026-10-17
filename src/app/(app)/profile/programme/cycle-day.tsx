import { ChevronDown } from "@/components/ui/icons";

import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DetailList } from "@/components/ui/detail-list";
import { Figures } from "@/components/ui/figures";
import { setLengthUnit, type SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures } from "@/lib/facts";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ProgramDayPlan } from "@/server/repositories/schedule";

/**
 * What it asks for: the sets, or the run in the athlete's road unit, or neither. On a day that
 * only runs, minutes its time already says over it are not said again.
 */
function cost(plan: ProgramDayPlan, units: SportUnits): string {
  const dayTime = plan.day.includesLifting ? null : plan.day.timeNote;
  const run = plan.run && runSummary(plan.run, units, { dayTime });
  if (plan.exercises.length > 0)
    return [planSummary(plan.exercises), run ? `Run: ${run}` : null]
      .filter(Boolean)
      .join(FACT_SEPARATOR);
  if (run !== null) return run;
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
  const asks = cost(plan, units);

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
      {/* What the day is, under its name, its figures held to their units: the coach's focus in
          its words' voice ("then 20 min easy"), as the day's page and Today say it, and its time
          a fact in Jost ("60–75 min"). */}
      {(day.focus || day.timeNote) && (
        <p className="col-span-full mt-0.5 text-sm text-ink-muted">
          {day.focus && holdFigures(day.focus)}
          {day.focus && day.timeNote && FACT_SEPARATOR}
          {day.timeNote && <Figures>{holdFigures(day.timeNote)}</Figures>}
        </p>
      )}
      {/* Its time and its counts in Jost, whose zero is plain: "60–75 min", "13 sets". */}
      {asks && (
        <p className="col-span-full mt-1 text-xs text-ink-muted tabular-nums">
          <Figures>{asks}</Figures>
        </p>
      )}
    </>
  );

  if (!expandable) return <div className={cn("box", HEAD)}>{head}</div>;

  return (
    <details className="group box min-w-0" open={open}>
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
        {day.includesLifting && (
          <LinkButton href={`/training/days/${day.id}`} variant="secondary">
            Open workout
          </LinkButton>
        )}
        {plan.exercises.length > 0 && (
          <PlannedExerciseList
            exercises={plan.exercises}
            length={setLengthUnit(units.distanceUnit)}
          />
        )}
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
