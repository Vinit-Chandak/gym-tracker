import type { Point } from "@/domain/analytics";

/**
 * The latest reading and what it has done since the first, so a chart opens with a number
 * rather than a shape. Nothing is claimed from a single reading: with one point there is no
 * change to report, so only the value is printed.
 */
export function Headline({
  points,
  unit,
  lowerIsBetter,
}: {
  points: readonly Point[];
  unit: string;
  /** Pace and RIR improve downwards; load and volume improve upwards. */
  lowerIsBetter?: boolean;
}) {
  const known = points.filter((p): p is Point & { value: number } => p.value !== null);
  if (known.length === 0) return null;
  const first = known[0]!.value;
  const last = known[known.length - 1]!.value;
  const delta = Math.round((last - first) * 10) / 10;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="text-xl font-medium tabular-nums">
        {Math.round(last * 10) / 10}
        <span className="ml-1 text-sm font-normal text-ink-muted">{unit}</span>
      </span>
      {known.length > 1 && delta !== 0 && (
        <span className={better ? "text-sm text-success" : "text-sm text-ink-muted"}>
          {delta > 0 ? "+" : ""}
          {delta} since {known[0]!.date.slice(5).split("-").reverse().join("/")}
        </span>
      )}
    </p>
  );
}
