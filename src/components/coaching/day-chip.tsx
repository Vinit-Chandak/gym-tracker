import { TONE_SOFT, type Tone } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

/** What a programme day is for, which decides its colour. */
export type DayKind = "lift" | "run" | "rest";

/** Lifting is cobalt, a run-only day tangerine, and a day off rose, as everywhere else. */
const DAY_TONE: Record<DayKind, Tone> = { lift: "lift", run: "run", rest: "rose" };

/** A day's kind from what it includes: lifting wins, a run alone is a run day, else rest. */
export function dayKind(day: { includesLifting: boolean; includesRun: boolean }): DayKind {
  return day.includesLifting ? "lift" : day.includesRun ? "run" : "rest";
}

/**
 * A programme day's place in the cycle, as a number on its kind's soft wash: how a list of
 * days says which is which before a name is read. Decorative, so whatever sits beside it
 * still has to say what the day is.
 */
export function DayChip({
  index,
  kind,
  className,
}: {
  /** The day's position in the cycle, from 1. */
  index: number;
  kind: DayKind;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[0.875rem] font-display text-display-s tabular-nums",
        TONE_SOFT[DAY_TONE[kind]],
        className,
      )}
    >
      {index}
    </span>
  );
}
