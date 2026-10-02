import {
  goalBand,
  goalStatus,
  type FoodTotals,
  type GoalStatus,
  type MacroTargets,
} from "@/domain/nutrition";
import { formatKcal } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MacroBars, type EatenEntry } from "./macro-bars";

/** The fill's pen: blue while the day is under way, green inside the band, amber past it. */
const GOAL_FILL: Record<GoalStatus, string> = {
  under: "bg-series-2",
  met: "bg-success",
  over: "bg-warning",
};

/** The standing beside the total, in the same three pens. */
const GOAL_INK: Record<GoalStatus, string> = {
  under: "text-ink-muted",
  met: "text-success",
  over: "text-warning",
};

/** How far past the target the bar runs, so the band's top end is never the bar's own end. */
const BAR_REACH = 1.25;

/**
 * The day's energy against its target, as a ruled bar: a track with the goal band washed onto
 * it and a hairline tick at each end of the band, drawn over the fill so the band stays
 * readable once the day's total has reached it. Past the reach of the bar the scale grows with
 * the total instead.
 */
export function GoalBar({ eaten, target }: { eaten: number; target: number }) {
  const band = goalBand(target);
  const status = goalStatus(eaten, target);
  const scale = Math.max(target * BAR_REACH, eaten);
  const share = (value: number) => `${(Math.min(Math.max(value, 0), scale) / scale) * 100}%`;
  return (
    <div
      role="img"
      aria-label={`${formatKcal(eaten)} of ${formatKcal(target)} kcal. The goal is met from ${formatKcal(band.low)} to ${formatKcal(band.high)} kcal.`}
      className="relative py-1"
    >
      <div className="relative h-2 overflow-hidden rounded-control bg-surface-raised">
        <div
          className="absolute inset-y-0 bg-success/20"
          style={{ left: share(band.low), width: share(band.high - band.low) }}
        />
        {eaten > 0 && (
          <div
            className={cn("absolute inset-y-0 left-0 rounded-control", GOAL_FILL[status])}
            style={{ width: share(eaten) }}
          />
        )}
      </div>
      {[band.low, band.high].map((end) => (
        <span key={end} className="absolute inset-y-0 w-px bg-ink" style={{ left: share(end) }} />
      ))}
    </div>
  );
}

/**
 * Where the day stands, beside its total, in the data voice: what is left while under the band,
 * that the goal is met once inside it, and by how much past it. A day still being eaten is not
 * a day that missed its goal, so under the band reads as what is left and nothing more.
 */
function Standing({ status, left }: { status: GoalStatus; left: number }) {
  return (
    <p className={cn("shrink-0 font-data text-sm font-semibold tabular-nums", GOAL_INK[status])}>
      {status === "met"
        ? "Goal met"
        : status === "over"
          ? `${formatKcal(-left)} over`
          : `${formatKcal(left)} left`}
    </p>
  );
}

/**
 * What the day has come to against its targets, at the top of the Food screen (ADR 0036): one
 * measure, the energy, with its target beside it and where that leaves the day, over the ruled
 * goal bar; then a ruled row for each macronutrient, each opening what the day's foods gave it.
 * The band's ends are drawn on the bar and not written out, so the block holds only the numbers
 * that move during the day.
 */
export function FoodSummary({
  eaten,
  target,
  entries,
}: {
  eaten: FoodTotals;
  target: MacroTargets;
  entries: readonly EatenEntry[];
}) {
  return (
    <div className="min-w-0">
      <div className="space-y-2 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {/* The spaces are for a screen reader, which reads the line as one string; beside
              flex items they take no room on the screen. */}
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="measure text-2xl">{formatKcal(eaten.kcal)}</span>{" "}
            <span className="font-data text-base text-ink-muted">
              / {formatKcal(target.kcal)} kcal
            </span>
          </p>{" "}
          <Standing status={goalStatus(eaten.kcal, target.kcal)} left={target.kcal - eaten.kcal} />
        </div>
        <GoalBar eaten={eaten.kcal} target={target.kcal} />
      </div>
      <div className="border-t border-line">
        <MacroBars eaten={eaten} target={target} entries={entries} />
      </div>
    </div>
  );
}
