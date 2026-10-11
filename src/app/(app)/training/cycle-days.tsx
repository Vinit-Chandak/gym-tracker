"use client";

import type { Route } from "next";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { Art } from "@/components/art/art";
import type { PrintPart } from "@/components/art/geometry";
import Link from "@/components/ui/app-link";
import { cn } from "@/lib/utils";

export type CycleDayTile = {
  id: string;
  href: Route;
  name: string;
  /** What the link is called aloud: "Day 3, Easy Run + Arms, next". */
  said: string;
  /** The day Today is offering: the full width, or two columns beyond a phone. */
  next: boolean;
  /** Where it stands, said beside the name when that is news: "Next", "In progress". */
  word: string | null;
  parts: readonly PrintPart[];
};

/**
 * The columns a grid is laid out in, as the browser resolved them. Null until measured, and in
 * a browser without `ResizeObserver`, when the stylesheet's own rules stand alone.
 */
function useColumns() {
  const ref = useRef<HTMLOListElement>(null);
  const [columns, setColumns] = useState<number | null>(null);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setColumns(getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);
  return { ref, columns };
}

/**
 * The cycle as its days' prints (board Training): in order, two to a row, the day Today is
 * offering the full width and named Next. A day's state is its ink, done full and to do thinned,
 * so the tiles carry only their names. Every print is drawn on one module, the smallest any of
 * them needs, so the week compares at a glance: a long day is wider, never drawn smaller.
 *
 * The days stay in the order they are trained, and the grid leaves no hole before the next one
 * (year audit). On a phone the day alone in its row before it takes the row (training.css).
 * Beyond one, where the next day stands across two of as many columns as fit, it takes one when
 * it falls in a row's last column, which only the laid-out grid knows.
 */
export function CycleDays({ days, label }: { days: readonly CycleDayTile[]; label: string }) {
  const [fits, setFits] = useState<Readonly<Record<string, number>>>({});
  const report = useCallback(
    (id: string, fit: number) =>
      setFits((current) => (current[id] === fit ? current : { ...current, [id]: fit })),
    [],
  );
  const known = days.map((day) => fits[day.id]).filter((fit) => fit !== undefined);
  const shared = known.length === days.length ? Math.min(...known) : undefined;
  const { ref, columns } = useColumns();
  const nextAt = days.findIndex((day) => day.next);
  const narrow = columns !== null && nextAt >= 0 && nextAt % columns === columns - 1;

  return (
    <ol ref={ref} aria-label={label} className="cycle-days">
      {days.map((day) => (
        <DayTile key={day.id} day={day} narrow={narrow} shared={shared} report={report} />
      ))}
    </ol>
  );
}

function DayTile({
  day,
  narrow,
  shared,
  report,
}: {
  day: CycleDayTile;
  /** The next day takes one column, where two would leave the row a hole. */
  narrow: boolean;
  /** The module every day is drawn at, once all have said what they fit. */
  shared: number | undefined;
  report: (id: string, fit: number) => void;
}) {
  const onModule = useCallback((fit: number) => report(day.id, fit), [day.id, report]);
  return (
    <li
      className={cn(
        "min-w-0",
        day.next && "cycle-day-next",
        day.next && narrow && "cycle-day-next-narrow",
      )}
    >
      <Link href={day.href} aria-label={day.said} className="cycle-day">
        <Art
          kind="print"
          parts={day.parts}
          module={shared}
          onModule={onModule}
          fallback={day.next ? { width: 362, height: 92 } : { width: 176, height: 64 }}
          className="cycle-day-print"
        />
        <span className="cycle-day-name">
          <span className="min-w-0 [overflow-wrap:anywhere]">{day.name}</span>
          {day.word && <span className="cycle-day-next-word">{day.word}</span>}
        </span>
      </Link>
    </li>
  );
}
