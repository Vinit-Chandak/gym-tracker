import { RangeSpans } from "@/components/graph/graph";
import type { TrainingSport } from "@/domain/sport-scope";

import { SportSwitch } from "./sport-switch";

/**
 * The two choices a friend's screens ask: the sport, and the span every graph shares (ADR
 * 0044), so their split and numbers cover the same 1M to All as every graph in the app and are
 * remembered with it. Each in its own row, the sport above: side by side, four sports had a
 * third of the row and broke their names across lines. Needs the page's `GraphRangeProvider`.
 */
export function SportSpanControls({ sport }: { sport: TrainingSport }) {
  return (
    <div className="grid gap-2">
      <SportSwitch value={sport} />
      <RangeSpans name="social" className="!mt-0" />
    </div>
  );
}
