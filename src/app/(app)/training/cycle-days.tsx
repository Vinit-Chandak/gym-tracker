"use client";

import type { Route } from "next";
import { useCallback, useState } from "react";

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
  /** The day Today is offering: the full width, and named Next. */
  next: boolean;
  parts: readonly PrintPart[];
};

/**
 * The cycle as its days' prints (board Training): in order, two to a row, the day Today is
 * offering the full width and named Next. A day's state is its ink, done full and to do thinned,
 * so the tiles carry only their names. Every print is drawn on one module, the smallest any of
 * them needs, so the week compares at a glance: a long day is wider, never drawn smaller.
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

  return (
    <ol aria-label={label} className="cycle-days">
      {days.map((day) => (
        <DayTile key={day.id} day={day} shared={shared} report={report} />
      ))}
    </ol>
  );
}

function DayTile({
  day,
  shared,
  report,
}: {
  day: CycleDayTile;
  /** The module every day is drawn at, once all have said what they fit. */
  shared: number | undefined;
  report: (id: string, fit: number) => void;
}) {
  const onModule = useCallback((fit: number) => report(day.id, fit), [day.id, report]);
  return (
    <li className={cn("min-w-0", day.next && "cycle-day-next")}>
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
          {day.next && <span className="cycle-day-next-word">Next</span>}
        </span>
      </Link>
    </li>
  );
}
