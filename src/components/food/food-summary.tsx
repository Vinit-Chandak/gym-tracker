import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
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
 * Where the day stands, as the figure that leads the card: what is left while under the band;
 * once inside it or past it, what was eaten, with the badge saying which. A day still being
 * eaten is not a day that missed its goal, so under the band reads as what is left and no more.
 */
function Standing({ eaten, target }: { eaten: number; target: number }) {
  const status = goalStatus(eaten, target);
  const left = target - eaten;
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 tabular-nums">
        <span className="font-display text-display-xl">
          {/* Whole kcal at this size: a tenth is noise in the one figure on the card. */}
          {formatKcal(Math.round(status === "under" ? left : eaten))}
        </span>{" "}
        <span className="text-headline font-semibold whitespace-nowrap">
          {status === "under" ? "kcal left" : "kcal eaten"}
        </span>
      </p>
      {status === "met" && <Badge tone="success">Goal met</Badge>}
      {status === "over" && <Badge tone="warning">{formatKcal(-left)} over</Badge>}
    </div>
  );
}

/**
 * What the day has come to against its targets, at the top of the Food screen (ADR 0036): the
 * figure that matters now, the energy against the goal band, then a row for each macronutrient,
 * each opening what the day's foods gave it. The band's ends are drawn on the bar and not written
 * out, so the card holds only the numbers that move during the day.
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
        <Standing eaten={eaten.kcal} target={target.kcal} />
        <GoalBar eaten={eaten.kcal} target={target.kcal} />
        <p className="flex items-center gap-1 text-sm font-semibold text-ink-muted tabular-nums">
          {formatKcal(eaten.kcal)} / {formatKcal(target.kcal)} kcal eaten
          <InfoTip label="About the goal" className="-my-2">
            The two marks on the bar are the goal: anywhere from 90% to 110% of the daily target
            meets it.
          </InfoTip>
        </p>
      </div>
      <MacroBars eaten={eaten} target={target} entries={entries} />
    </div>
  );
}
