import type { Period } from "@/domain/period";
import type { TrainingSport } from "@/domain/sport-scope";

import { PeriodSelect } from "./period-select";
import { SportSwitch } from "./sport-switch";

/**
 * The two choices a social screen asks (plan §3.1): sport and period, each in its own
 * control. Stacked on a phone; from 640px the six pills share one row, the sport a third
 * of it, since that is where they all fit at their minimum width.
 */
export function SportPeriodControls({ sport, period }: { sport: TrainingSport; period: Period }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
      <SportSwitch value={sport} />
      <PeriodSelect value={period} />
    </div>
  );
}
