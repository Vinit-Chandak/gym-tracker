import { cn } from "@/lib/utils";

const SPORT_FILL = {
  strength: "bg-print-strength",
  running: "bg-print-run",
  cycling: "bg-print-ride",
  swimming: "bg-print-swim",
};

/**
 * A filled track: how far through something is. `role="img"` with a written label rather
 * than `progressbar`, because the fraction it draws is always written beside it and a
 * screen reader should not read the same numbers twice.
 */
export function ProgressBar({
  value,
  max,
  label,
  className,
  sport,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
  /** A programme's own progress carries its sport; unrelated progress remains ink. */
  sport?: keyof typeof SPORT_FILL;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  // On the ground or in a card, the track is the rule's grey; the fill ends square, so a bar just
  // begun reads as a start and never as a slider's handle (owner, 28 October 2026).
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-hair", className)}
    >
      <div
        className={cn("h-full", sport ? SPORT_FILL[sport] : "bg-ink")}
        style={{ width: `${percent}%`, minWidth: value > 0 ? "12px" : undefined }}
      />
    </div>
  );
}
