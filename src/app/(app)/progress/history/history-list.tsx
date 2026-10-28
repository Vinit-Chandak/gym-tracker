import type { Route } from "next";

import { SportSign } from "@/components/art/sign";
import type { Sport } from "@/components/art/geometry";
import { dayLabel } from "@/components/graph/labels";
import Link from "@/components/ui/app-link";
import { Figures } from "@/components/ui/figures";
import { Glyph } from "@/components/ui/glyphs";
import { joinFacts } from "@/lib/facts";
import { cn } from "@/lib/utils";

export type HistoryItem = {
  id: string;
  /** Every sport history holds, plus the recovery readings that are not training at all. */
  kind: "workout" | "run" | "cycling" | "swimming" | "recovery";
  /** When it began, for the order within its day; a recovery reading has only its date. */
  date: string;
  /** The local day it is listed under: the day it was recorded on, as the calendar marks it. */
  day: string;
  title: string;
  /** Its time and where: "19:00 · Anytime Fitness"; a recovery reading's answers. */
  subtitle: string;
  href?: Route<`/workouts/${string}` | `/runs/${string}` | `/progress/activities/${string}`>;
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
  const line = joinFacts([item.subtitle, item.recovery]);
  const content = (
    <>
      <span className="mark-cell">
        {item.kind === "recovery" ? (
          <Glyph name="moon" label="Recovery" className="glyph-18" />
        ) : (
          <SportSign sport={KIND_MARKS[item.kind]} label={KIND_LABELS[item.kind]} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {/* The figure stands beside the name while both fit, under it when not. */}
        <span className="flex flex-wrap items-baseline justify-between gap-x-2.5">
          <span className="plan-row-name min-w-[min(100%,9rem)] flex-1 [overflow-wrap:break-word] tabular-nums">
            {item.title}
          </span>
          {item.meta && (
            <span className="shrink-0 type-meta font-semibold tabular-nums">
              <Figures>{item.meta}</Figures>
            </span>
          )}
        </span>
        {/* Its time and its readings are facts: their digits tabular. */}
        {line && (
          <span className="type-meta-small [overflow-wrap:break-word] text-ink-2 tabular-nums">
            <Figures>{line}</Figures>
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
 * Entries as History lists them (board Progress-History): each day's under its caption, in a card
 * of their own (owner, 28 October 2026), newest first, each its sign in one column, its name, its
 * figure and its time and place.
 */
export function HistoryList({
  items,
  today,
}: {
  items: readonly HistoryItem[];
  /** Today in the account's time zone: a day in another year is named with it. */
  today: string;
}) {
  return (
    <>
      {byDay(items).map((group) => (
        <section key={group.day} aria-labelledby={`history-${group.day}`}>
          <h2 id={`history-${group.day}`} className="group-caption">
            {dayLabel(group.day, today)}
          </h2>
          <ul className="ov-panel ov-panel-list">
            {group.items.map((item, itemIndex) => (
              <HistoryRow key={item.id} item={item} last={itemIndex === group.items.length - 1} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
