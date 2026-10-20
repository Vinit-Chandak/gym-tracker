import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { LinkButton } from "@/components/ui/button";
import { DetailList } from "@/components/ui/detail-list";
import { Disclosure } from "@/components/ui/disclosure";
import { setLengthUnit, type SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import type { ProgramDayPlan } from "@/server/repositories/schedule";

/**
 * What it asks for: the sets, or the run in the athlete's road unit, or neither. On a day that
 * only runs, minutes its time already says over it are not said again; a rest day says it only
 * where its name does not ("Rest + Mobility" is not "Rest day" again).
 */
function cost(plan: ProgramDayPlan, units: SportUnits): string | null {
  const dayTime = plan.day.includesLifting ? null : plan.day.timeNote;
  const run = plan.run && runSummary(plan.run, units, { dayTime });
  if (plan.exercises.length > 0)
    return [planSummary(plan.exercises), run ? `Run: ${run}` : null]
      .filter(Boolean)
      .join(FACT_SEPARATOR);
  if (run !== null) return run;
  return /\brest\b/i.test(plan.day.name) ? null : "Rest day";
}

/**
 * One day of the cycle, opening on to everything the day prescribes: a ruled row of a list of
 * folds (DESIGN.md, Folds) that says the day's name and, at its end, where it stands and what it
 * asks for; what the day is for and how long it takes are the fold's first line. A day with
 * nothing to open, a plain rest day, is the same row without the fold, rather than a control that
 * does nothing. `open` is a day whose workout is under way, which is in progress rather than next.
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
  const about = joinFacts([
    day.focus && holdFigures(day.focus),
    day.timeNote && holdFigures(day.timeNote),
  ]);
  const expandable =
    plan.exercises.length > 0 ||
    guidance ||
    Boolean(plan.warmupName || day.effortNote || day.notes);
  const state = open
    ? "In progress"
    : plan.isNext
      ? "Next"
      : plan.status === "completed" || plan.status === "skipped"
        ? SLOT_STATUS_LABELS[plan.status]
        : null;
  const meta = joinFacts([state, cost(plan, units)]) || undefined;

  if (!expandable)
    return (
      <div className="flex min-h-[var(--ov-target)] flex-wrap items-center gap-x-2 gap-y-1 border-y border-line py-2 text-sm">
        <p className="min-w-0 flex-1 font-medium [overflow-wrap:break-word]">{day.name}</p>
        {(meta || about) && (
          <p className="text-xs text-ink-muted tabular-nums">{joinFacts([meta, about])}</p>
        )}
      </div>
    );

  return (
    <Disclosure summary={day.name} meta={meta} defaultOpen={open} variant="inline">
      <div className="space-y-4">
        {about && <p className="text-sm text-ink-muted">{about}</p>}
        {day.includesLifting && (
          <LinkButton href={`/plan/strength/days/${day.id}`} variant="secondary">
            Open workout
          </LinkButton>
        )}
        {plan.exercises.length > 0 && (
          <PlannedExerciseList
            exercises={plan.exercises}
            length={setLengthUnit(units.distanceUnit)}
          />
        )}
        {/* Inside the day's own fold, how to run it is said whole rather than folded again. */}
        {plan.run && guidance && <RunPlanDetails run={plan.run} folded={false} />}
        <DetailList
          entries={[
            ["Warm-up", plan.warmupName],
            ["Effort", day.effortNote],
            ["Notes", day.notes],
          ]}
        />
      </div>
    </Disclosure>
  );
}
