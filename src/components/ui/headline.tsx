import type { Point } from "@/domain/analytics";
import { formatIsoShortDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The latest reading and what it has done since the first, so a chart opens with a number
 * rather than a shape (board Body: "77.5 kg +1.4 since 8 Jul"). Nothing is claimed from a
 * single reading: with one point there is no change to report, so only the value is printed.
 * The change is said, never coloured: better or worse is the reader's to judge.
 */
export function Headline({
  points,
  unit,
  size = "l",
}: {
  points: readonly Point[];
  unit: string;
  /** "xl": the screen's one figure (body weight); "l": a stat over a chart. */
  size?: "xl" | "l";
}) {
  const known = points.filter((p): p is Point & { value: number } => p.value !== null);
  if (known.length === 0) return null;
  const first = known[0]!.value;
  const last = known[known.length - 1]!.value;
  const delta = Math.round((last - first) * 10) / 10;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="whitespace-nowrap">
        <span className={cn(size === "xl" ? "type-figure-xl" : "type-figure-l")}>
          {Math.round(last * 10) / 10}
        </span>{" "}
        <span
          className={cn(
            "font-semibold text-ink-2",
            size === "xl" ? "text-[length:var(--ov-type-body)]" : "type-caption",
          )}
        >
          {unit}
        </span>
      </span>
      {known.length > 1 && delta !== 0 && (
        <span className="type-meta font-semibold text-ink-2 tabular-nums">
          {delta > 0 ? "+" : ""}
          {delta} since {formatIsoShortDay(known[0]!.date)}
        </span>
      )}
    </p>
  );
}
