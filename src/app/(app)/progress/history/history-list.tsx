import type { Route } from "next";

import { Art } from "@/components/art/art";
import type { Sport } from "@/components/art/geometry";
import { dayLabel } from "@/components/graph/labels";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { formatIsoMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

export type HistoryItem = {
  id: string;
  /** Every sport history holds, plus the recovery readings that are not training at all. */
  kind: "workout" | "run" | "cycling" | "swimming" | "recovery";
  /** When it began, for the order; a recovery reading has only its date. */
  date: string;
  /** The local day it is listed under. */
  day: string;
  title: string;
  /** Its time and where: "19:00 · Anytime Fitness"; a recovery reading's answers. */
  subtitle: string;
  href?: Route<`/workouts/${string}` | `/runs/${string}` | `/training/activities/${string}`>;
  meta: string;
  gymId: string | null;
  exercises: { id: string; name: string; machineId: string | null; machineName: string | null }[];
  recovery?: string;
};

/** What each row's mark says aloud. Exhaustive: a sport added later has to be named here. */
const KIND_LABELS: Record<HistoryItem["kind"], string> = {
  workout: "Workout",
  run: "Run",
  cycling: "Ride",
  swimming: "Swim",
  recovery: "Recovery",
};

/** Each sport's mark; recovery, which is not training, is the moon. */
const KIND_MARKS: Record<Exclude<HistoryItem["kind"], "recovery">, Sport> = {
  workout: "strength",
  run: "run",
  cycling: "ride",
  swimming: "swim",
};

/** Entries under their days, in the order given (newest first). */
function byDay(items: readonly HistoryItem[]) {
  return items.reduce<{ day: string; items: HistoryItem[] }[]>((all, item) => {
    const last = all.at(-1);
    if (last?.day === item.day) last.items.push(item);
    else all.push({ day: item.day, items: [item] });
    return all;
  }, []);
}

function HistoryRow({ item, last }: { item: HistoryItem; last: boolean }) {
  const line = [item.subtitle, item.recovery].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="mark-cell">
        {item.kind === "recovery" ? (
          <Glyph name="moon" label="Recovery" className="glyph-18" />
        ) : (
          <Art kind="mark" sport={KIND_MARKS[item.kind]} size={16} label={KIND_LABELS[item.kind]} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {/* The figure stands beside the name while both fit, under it when not. */}
        <span className="flex flex-wrap items-baseline justify-between gap-x-2.5">
          <span className="plan-row-name min-w-[min(100%,9rem)] flex-1 [overflow-wrap:anywhere] tabular-nums">
            {item.title}
          </span>
          {item.meta && (
            <span className="shrink-0 type-meta font-semibold tabular-nums">{item.meta}</span>
          )}
        </span>
        {line && (
          <span className="type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums">
            {line}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link
          prefetch="intent"
          href={item.href}
          className={cn("history-row", last && "plan-row-last")}
        >
          {content}
        </Link>
      ) : (
        <div className={cn("history-row", last && "plan-row-last")}>{content}</div>
      )}
    </li>
  );
}

/**
 * Entries as History lists them (board Progress-History): each under its day, newest first, its
 * mark in one column, its name, its figure and its time and place. History draws a page of them;
 * Overview draws the latest ten under its month (ADR 0045).
 */
export function HistoryList({
  items,
  today,
  level = 2,
  month = null,
}: {
  items: readonly HistoryItem[];
  /** Today in the account's time zone: a day in another year is named with it. */
  today: string;
  /** The days' headings: 2 on History, 3 under a heading of their own on Overview. */
  level?: 2 | 3;
  /**
   * The month the list is read beside, "2026-10" (Overview's calendar). The days before it
   * stand under their own month's name, so the list says where the calendar stops.
   */
  month?: string | null;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const days = byDay(items);
  return (
    <>
      {days.map((group, index) => {
        // Each month the list reaches past the calendar's is named once, over its first day.
        const own = group.day.slice(0, 7);
        const before = index === 0 ? month : days[index - 1]!.day.slice(0, 7);
        const named = month !== null && own !== before;
        return (
          <section key={group.day} aria-labelledby={`history-${group.day}`}>
            {named && (
              <Heading className="list-month">{formatIsoMonth(own, today.slice(0, 4))}</Heading>
            )}
            <Heading id={`history-${group.day}`} className="caption-head mt-3.5">
              {dayLabel(group.day, today)}
            </Heading>
            <ul>
              {group.items.map((item, itemIndex) => (
                <HistoryRow key={item.id} item={item} last={itemIndex === group.items.length - 1} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
