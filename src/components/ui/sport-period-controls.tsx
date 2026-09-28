import type { Period } from "@/domain/period";
import type { TrainingSport } from "@/domain/sport-scope";

import { PeriodSelect } from "./period-select";
import { SportSwitch } from "./sport-switch";

/**
 * The two choices a social screen asks (plan §3.1): sport and period, each in its own
 * control, the sport above the period at every width. Side by side, four sports had a third of
 * the row and broke their names across lines, and the two rows of pills did not line up.
 */
export function SportPeriodControls({ sport, period }: { sport: TrainingSport; period: Period }) {
  return (
    <div className="grid gap-2">
      <SportSwitch value={sport} />
      <PeriodSelect value={period} />
    </div>
  );
}
