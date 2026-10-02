import { NumberCell, type CellState } from "@/components/coaching/sheet-bits";
import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { runSummary } from "@/components/run-plan";
import { Badge } from "@/components/ui/badge";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
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

/**
 * The rest of what the day says — warm-up, effort, notes, and how to run its run — as short
 * labelled lines that wrap, so a day's small print costs a few lines rather than a column.
 */
function DayDetails({ entries }: { entries: readonly (readonly [string, string | null])[] }) {
  const shown = entries.filter(([, value]) => value);
  if (shown.length === 0) return null;
  return (
    <dl className="mt-3 space-y-1 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-ink-muted">{label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The cell's state follows the day's: the next one is under the highlighter, done is inked. */
function cellState(plan: ProgramDayPlan): CellState {
  if (plan.isNext) return "current";
  if (plan.status === "completed") return "done";
  if (plan.status === "skipped") return "skipped";
  return "pending";
}

/**
 * One day of the cycle, written out: its number in the margin like a cell of the cycle
 * strip, its name, what it costs, then every exercise it prescribes as a row of the plan.
 * Cycle is the one place the programme is printed in full, so nothing here is folded away.
 * Stack these inside a `box-rows` list; each takes its own rule.
 */
export function CycleDay({ plan }: { plan: ProgramDayPlan }) {
  const { day } = plan;
  const badge = plan.isNext ? (
    <Badge tone="highlight">Next</Badge>
  ) : plan.status === "completed" || plan.status === "skipped" ? (
    <Badge tone={plan.status === "completed" ? "success" : "warning"}>
      {SLOT_STATUS_LABELS[plan.status]}
    </Badge>
  ) : null;

  return (
    <article className="min-w-0 py-4" aria-label={`Day ${day.dayIndex}, ${day.name}`}>
      <div className="flex items-start gap-3">
        <NumberCell number={day.dayIndex} state={cellState(plan)} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg [overflow-wrap:anywhere]">{day.name}</h3>
              {subtitle(day) && <p className="mt-0.5 text-sm text-ink-muted">{subtitle(day)}</p>}
            </div>
            {badge}
          </div>
          <p className="mt-1 font-data text-sm text-ink-muted tabular-nums">{cost(plan)}</p>
        </div>
      </div>
      {plan.exercises.length > 0 && (
        <div className="mt-3">
          <PlannedExerciseList exercises={plan.exercises} />
        </div>
      )}
      <DayDetails
        entries={[
          ["Pace", plan.run?.paceNote ?? null],
          ["Progression", plan.run?.progressionNote ?? null],
          ["Stop if", plan.run?.stopRule ?? null],
          ["Warm-up", plan.warmupName],
          ["Effort", day.effortNote],
          ["Notes", day.notes],
        ]}
      />
    </article>
  );
}
