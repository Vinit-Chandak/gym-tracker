import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  goalBand,
  goalStatus,
  type FoodTotals,
  type GoalStatus,
  type MacroTargets,
} from "@/domain/nutrition";
import { formatFoodAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Under the band says nothing: a day still being eaten is not a day that missed its goal. */
const GOAL_BADGE: Record<GoalStatus, ReactNode> = {
  under: null,
  met: <Badge tone="success">Goal met</Badge>,
  over: <Badge tone="warning">Over</Badge>,
};

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
      aria-label={`${formatFoodAmount(eaten)} of ${formatFoodAmount(target)} kcal. The goal is met from ${formatFoodAmount(band.low)} to ${formatFoodAmount(band.high)} kcal.`}
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

const MACROS = [
  { key: "carbsG", label: "Carbs", fill: "bg-series-2" },
  { key: "fatG", label: "Fat", fill: "bg-series-4" },
  { key: "proteinG", label: "Protein", fill: "bg-series-3" },
] as const;

/**
 * Grams eaten against grams set, one thin bar each. The numbers are written above every bar, so
 * the bars are left out of the accessibility tree rather than read out a second time.
 */
export function MacroBars({ eaten, target }: { eaten: FoodTotals; target: MacroTargets }) {
  return (
    <dl className="grid grid-cols-3 gap-3">
      {MACROS.map(({ key, label, fill }) => {
        const share =
          target[key] > 0 ? Math.min(1, eaten[key] / target[key]) : eaten[key] > 0 ? 1 : 0;
        return (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-0.5 text-sm tabular-nums">
              {formatFoodAmount(eaten[key])}
              <span className="text-ink-muted"> / {formatFoodAmount(target[key])} g</span>
            </dd>
            <dd aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={cn("h-full rounded-full", fill)}
                style={{ width: `${share * 100}%` }}
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * What the day has come to against its targets: Today's card and the top of the Food screen, the
 * same figures drawn the same way. `detail` adds what is left, and where the goal band runs.
 */
export function FoodSummary({
  eaten,
  target,
  eyebrow,
  trailing,
  detail = false,
}: {
  eaten: FoodTotals;
  target: MacroTargets;
  /** A heading above the figures, for a card that has no page title to stand under. */
  eyebrow?: string;
  /** Beside the goal's badge: the chevron of a card that opens somewhere. */
  trailing?: ReactNode;
  detail?: boolean;
}) {
  const status = goalStatus(eaten.kcal, target.kcal);
  const band = goalBand(target.kcal);
  // From the rounded total, so what is left and what was eaten add up to the target as shown.
  const left = target.kcal - Math.round(eaten.kcal);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <h2 className="mb-1 text-xs font-medium tracking-wide text-ink-muted uppercase">
              {eyebrow}
            </h2>
          )}
          <p className="text-lg font-medium tabular-nums">
            {formatFoodAmount(eaten.kcal)}
            <span className="text-sm font-normal text-ink-muted">
              {" "}
              / {formatFoodAmount(target.kcal)} kcal
            </span>
          </p>
        </div>
        {(GOAL_BADGE[status] || trailing) && (
          <span className="flex shrink-0 items-center gap-1.5">
            {GOAL_BADGE[status]}
            {trailing}
          </span>
        )}
      </div>
      <GoalBar eaten={eaten.kcal} target={target.kcal} />
      {detail && (
        <p className="text-sm text-ink-muted tabular-nums">
          {left >= 0
            ? `${formatFoodAmount(left)} kcal left`
            : `${formatFoodAmount(-left)} kcal over target`}
          {` · Goal ${formatFoodAmount(band.low)}–${formatFoodAmount(band.high)}`}
        </p>
      )}
      <MacroBars eaten={eaten} target={target} />
    </div>
  );
}
