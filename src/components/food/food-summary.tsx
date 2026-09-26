import { Badge } from "@/components/ui/badge";
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

const GOAL_FILL: Record<GoalStatus, string> = {
  under: "bg-accent",
  met: "bg-success",
  over: "bg-warning",
};

/** How far past the target the bar runs, so the band's top end is never the bar's own end. */
const BAR_REACH = 1.25;

/**
 * The day's energy against its target, with the goal band drawn onto the track: a wash where the
 * goal is met and a tick at each end, over the fill, so the band stays readable once the day's
 * total has reached it. Past the reach of the bar the scale grows with the total instead.
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
      className="relative h-2.5 rounded-full bg-surface-raised"
    >
      <div
        className="absolute inset-y-0 bg-success/25"
        style={{ left: share(band.low), width: share(band.high - band.low) }}
      />
      {eaten > 0 && (
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", GOAL_FILL[status])}
          style={{ width: share(eaten) }}
        />
      )}
      {[band.low, band.high].map((end) => (
        <span
          key={end}
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink-muted"
          style={{ left: share(end) }}
        />
      ))}
    </div>
  );
}

/**
 * Where the day stands, beside its total: what is left while under the band, that the goal is met
 * once inside it, and by how much past it. A day still being eaten is not a day that missed its
 * goal, so under the band reads as what is left and nothing more.
 */
function Standing({ status, left }: { status: GoalStatus; left: number }) {
  if (status === "met") return <Badge tone="success">Goal met</Badge>;
  if (status === "over") return <Badge tone="warning">{formatKcal(-left)} over</Badge>;
  return (
    <p className="shrink-0 text-sm text-ink-muted tabular-nums">
      <span className="font-medium text-ink">{formatKcal(left)}</span> left
    </p>
  );
}

/**
 * What the day has come to against its targets, at the top of the Food screen (ADR 0036): the
 * energy against the goal band with where that leaves the day beside it, then a row for each
 * macronutrient, each opening what the day's foods gave it. The band's ends are drawn on the bar
 * and not written out, so the card holds only the numbers that move during the day.
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
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-xl font-medium tabular-nums">
            {formatKcal(eaten.kcal)}
            <span className="text-sm font-normal text-ink-muted">
              {" "}
              / {formatKcal(target.kcal)} kcal
            </span>
          </p>{" "}
          <Standing status={goalStatus(eaten.kcal, target.kcal)} left={target.kcal - eaten.kcal} />
        </div>
        <GoalBar eaten={eaten.kcal} target={target.kcal} />
      </div>
      <MacroBars eaten={eaten} target={target} entries={entries} />
    </div>
  );
}
