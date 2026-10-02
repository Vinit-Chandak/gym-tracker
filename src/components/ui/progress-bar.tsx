import { cn } from "@/lib/utils";

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
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-control bg-surface-raised", className)}
    >
      {/* Drawn at full width and scaled from the left: a change of value moves on the
          compositor rather than reflowing the row. */}
      <div
        className="h-full w-full origin-left rounded-control bg-pen transition-transform duration-[var(--ov-duration-sheet)] ease-[var(--ov-ease-out)]"
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  );
}
