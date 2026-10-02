import type { Point } from "@/domain/analytics";

/**
 * The latest reading and what it has done since the first, so a chart opens with a number
 * rather than a shape: the measure in the data voice, its unit beside it, and the change as a
 * signed figure in the same voice. Nothing is claimed from a single reading: with one point
 * there is no change to report, so only the value is printed.
 */
export function Headline({
  points,
  unit,
  lowerIsBetter,
  format = (value) => String(Math.round(value * 10) / 10),
}: {
  points: readonly Point[];
  unit: string;
  /** Pace and RIR improve downwards; load and volume improve upwards. */
  lowerIsBetter?: boolean;
  /** How the value and its change read: "5:30" for a pace, "1 h 12 min" for a duration. */
  format?: (value: number) => string;
}) {
  const known = points.filter((p): p is Point & { value: number } => p.value !== null);
  if (known.length === 0) return null;
  const first = known[0]!.value;
  const last = known[known.length - 1]!.value;
  const delta = Math.round((last - first) * 10) / 10;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="measure text-2xl">
        {format(last)}
        {/* A format that writes its own unit, "1 h 12 min", passes an empty one. */}
        {unit && <span className="ml-1 font-sans text-sm font-normal text-ink-muted">{unit}</span>}
      </span>
      {known.length > 1 && delta !== 0 && (
        <span
          className={
            better
              ? "font-data text-sm font-medium text-success tabular-nums"
              : "font-data text-sm font-medium text-ink-muted tabular-nums"
          }
        >
          {delta > 0 ? "+" : "−"}
          {format(Math.abs(delta))} since {known[0]!.date.slice(5).split("-").reverse().join("/")}
        </span>
      )}
    </p>
  );
}
