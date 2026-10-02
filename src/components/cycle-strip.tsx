import Link from "@/components/ui/app-link";
import { Dumbbell, Moon, Run } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { DayStatus, ScheduleDay } from "@/server/repositories/schedule";

/** What a day of the cycle asks for, as one small glyph. */
function DayGlyph({ day, className }: { day: ScheduleDay; className?: string }) {
  if (day.includesLifting) return <Dumbbell className={cn("!size-3.5", className)} aria-hidden />;
  if (day.includesRun) return <Run className={cn("!size-3.5", className)} aria-hidden />;
  return <Moon className={cn("!size-3.5", className)} aria-hidden />;
}

function dayKind(day: ScheduleDay): string {
  if (day.includesLifting && day.includesRun) return "lifting and running";
  if (day.includesLifting) return "lifting";
  if (day.includesRun) return "running";
  return "rest";
}

/**
 * Where today sits on the plan: the current cycle as a row of cells, one per programme day.
 * Days already trained are inked in, today's cell is under the highlighter, a skipped day is
 * struck through, and the days still to come are outlined. The whole strip opens the list of
 * days, so training out of sequence is one tap from the position it changes.
 */
export function CycleStrip({
  days,
  cycleIndex,
  cycles,
  todayIndex,
  behind,
}: {
  days: readonly DayStatus[];
  cycleIndex: number;
  cycles: number;
  /** The programme day being offered, which the highlighter marks. */
  todayIndex: number | null;
  behind: number;
}) {
  const standing = behind > 0 ? `${behind} behind` : "On track";
  return (
    <Link
      href="/today/choose"
      aria-label={`Choose a day. Cycle ${cycleIndex} of ${cycles}${
        todayIndex ? `, day ${todayIndex}` : ""
      }, ${standing.toLowerCase()}.`}
      className="block py-3 transition-colors duration-[var(--ov-duration-feedback)] rule-bottom rule-top active:bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          Cycle {cycleIndex} of {cycles}
        </p>
        <p
          className={cn(
            "font-data text-sm font-semibold tabular-nums",
            behind > 0 ? "text-warning" : "text-success",
          )}
        >
          {standing}
        </p>
      </div>
      <ol
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
      >
        {days.map(({ day, status }) => {
          const isToday = day.dayIndex === todayIndex;
          return (
            <li
              key={day.id}
              aria-label={`Day ${day.dayIndex}, ${day.name}, ${dayKind(day)}${
                isToday
                  ? ", today"
                  : status === "completed"
                    ? ", done"
                    : status === "skipped"
                      ? ", skipped"
                      : ""
              }`}
              className={cn(
                "flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border",
                isToday
                  ? "border-highlight-strong bg-highlight text-on-highlight"
                  : status === "completed"
                    ? "border-ink bg-ink text-canvas"
                    : status === "skipped"
                      ? "border-line-strong text-ink-subtle"
                      : status === "not_in_programme"
                        ? "border-dashed border-line text-ink-ghost"
                        : "border-line text-ink-muted",
              )}
            >
              <span
                className={cn(
                  "font-data text-sm leading-none font-semibold tabular-nums",
                  status === "skipped" && "line-through",
                )}
              >
                {day.dayIndex}
              </span>
              <DayGlyph day={day} />
            </li>
          );
        })}
      </ol>
    </Link>
  );
}
