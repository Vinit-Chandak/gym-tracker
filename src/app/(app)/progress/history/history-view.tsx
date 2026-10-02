"use client";

import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { Route } from "next";

import { DateRangeFields } from "@/components/date-range-fields";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { Field } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS, ROW_CLASS } from "@/components/ui/link-row";
import { Select } from "@/components/ui/select";
import { formatDateRange, formatIsoDate, formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Bicycle,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Heartbeat,
  Run,
  Waves,
  type AppIcon,
} from "@/components/ui/icons";
import Link from "@/components/ui/app-link";

import { ProgressSections } from "../progress-sections";

export type HistoryItem = {
  id: string;
  /** Every sport history holds, plus the recovery readings that are not training at all. */
  kind: "workout" | "run" | "cycling" | "swimming" | "recovery";
  date: string;
  /** The civil day the entry belongs to in the account's time zone; the day of `date` otherwise. */
  day?: string;
  title: string;
  subtitle: string;
  href?: Route<`/workouts/${string}` | `/runs/${string}` | `/training/activities/${string}`>;
  meta: string;
  gymId: string | null;
  exercises: { id: string; name: string; machineId: string | null; machineName: string | null }[];
  recovery?: string;
};

type Filters = { kind: string; gym: string; exercise: string; machine: string };

/** What each row calls itself. Exhaustive: a sport added later has to be named here. */
const KIND_LABELS: Record<HistoryItem["kind"], string> = {
  workout: "Workout",
  run: "Run",
  cycling: "Ride",
  swimming: "Swim",
  recovery: "Recovery",
};

/** The glyph in each row's margin, named for a screen reader with the row's kind. */
const KIND_ICONS: Record<HistoryItem["kind"], AppIcon> = {
  workout: Dumbbell,
  run: Run,
  cycling: Bicycle,
  swimming: Waves,
  recovery: Heartbeat,
};

const EMPTY: Filters = { kind: "all", gym: "", exercise: "", machine: "" };

const FILTER_PARAMS: Record<keyof Filters, string> = {
  kind: "kind",
  gym: "gym",
  exercise: "exercise",
  machine: "machine",
};

/**
 * The starting filters, from the URL.
 *
 * Read through `useSearchParams` rather than `window.location`: this component is rendered
 * on the server too, where there is no window, and a filtered link would then arrive as an
 * unfiltered list in the HTML and rearrange itself the moment it hydrated.
 */
function fromSearch(params: URLSearchParams | ReadonlyURLSearchParams): Filters {
  return {
    kind: params.get(FILTER_PARAMS.kind) ?? EMPTY.kind,
    gym: params.get(FILTER_PARAMS.gym) ?? EMPTY.gym,
    exercise: params.get(FILTER_PARAMS.exercise) ?? EMPTY.exercise,
    machine: params.get(FILTER_PARAMS.machine) ?? EMPTY.machine,
  };
}

/** "Today", "Yesterday", "Fri 11 Sept", and with its year once the day is in another one. */
function dayLabel(day: string, today: string | undefined): string {
  if (!today) return formatIsoDate(day);
  return day.slice(0, 4) === today.slice(0, 4) ? formatRelativeDay(day, today) : formatIsoDate(day);
}

/**
 * One entry: the kind's glyph in the margin, the title, what else it says under it, and the
 * measures at the end of the row in the data voice. A link where there is a record to open;
 * a recovery reading is the row itself.
 */
function HistoryRow({ item }: { item: HistoryItem }) {
  const Icon = KIND_ICONS[item.kind];
  const content = (
    <>
      <Icon
        scale="row"
        role="img"
        aria-label={KIND_LABELS[item.kind]}
        className="shrink-0 text-ink-muted"
      />
      <span className="min-w-0 flex-[1_1_8rem]">
        <span className="block font-medium [overflow-wrap:anywhere]">{item.title}</span>
        {item.subtitle && (
          <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted">
            {item.subtitle}
          </span>
        )}
        {item.recovery && (
          <span className="mt-0.5 block text-xs [overflow-wrap:anywhere] text-ink-muted">
            {item.recovery}
          </span>
        )}
      </span>
      {(item.meta || item.href) && (
        <span className="ml-auto flex max-w-full items-center gap-2">
          {item.meta && (
            <span className="min-w-0 text-right font-data text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
              {item.meta}
            </span>
          )}
          {item.href && <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />}
        </span>
      )}
    </>
  );
  return item.href ? (
    <Link href={item.href} prefetch="intent" className={cn(PRESSABLE_ROW_CLASS, "flex-wrap")}>
      {content}
    </Link>
  ) : (
    <div className={cn(ROW_CLASS, "flex-wrap")}>{content}</div>
  );
}

export function HistoryView({
  range,
  items,
  gyms,
  truncated,
  today,
}: {
  /** The dates the server read, changed from inside the filter sheet. */
  range: { from: string; to: string };
  items: HistoryItem[];
  gyms: { id: string; name: string }[];
  /** The list stops at the newest records the server would send, short of the whole range. */
  truncated: boolean;
  /** Today in the account's time zone, so the newest days can be called Today and Yesterday. */
  today?: string;
}) {
  // Filtering happens on data the page already has, so it stays local and immediate. The
  // URL is updated through the History API purely so that coming back from an entry
  // restores the same view, without that costing a fetch on every change.
  const searchParams = useSearchParams();
  // Next also updates useSearchParams for the native History API. Read the current URL
  // every render so Back, deep links and a changed date range cannot leave stale filters.
  const filters = fromSearch(searchParams);

  const apply = (next: Filters) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, param] of Object.entries(FILTER_PARAMS) as [keyof Filters, string][]) {
      if (next[key] && next[key] !== EMPTY[key]) params.set(param, next[key]);
      else params.delete(param);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  };

  const choices = useMemo(
    () =>
      [
        ...new Map(
          items.flatMap((item) =>
            item.exercises.map((e) => [e.id, { id: e.id, name: e.name }] as const),
          ),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );
  const machines = useMemo(
    () => [
      ...new Map(
        items
          .filter((item) => !filters.gym || item.gymId === filters.gym)
          .flatMap((item) =>
            item.exercises
              .filter((e) => (!filters.exercise || e.id === filters.exercise) && e.machineId)
              .map((e) => [e.machineId!, { id: e.machineId!, name: e.machineName! }] as const),
          ),
      ).values(),
    ],
    [items, filters.gym, filters.exercise],
  );

  /** The sports this history actually contains, so the filter offers only what is there. */
  const kinds = useMemo(() => new Set(items.map((item) => item.kind)), [items]);

  const shown = items.filter(
    (item) =>
      (filters.kind === "all" || item.kind === filters.kind) &&
      (!filters.gym || item.gymId === filters.gym) &&
      ((!filters.exercise && !filters.machine) ||
        item.exercises.some(
          (e) =>
            (!filters.exercise || e.id === filters.exercise) &&
            (!filters.machine || e.machineId === filters.machine),
        )),
  );
  const active = (Object.keys(EMPTY) as (keyof Filters)[]).filter(
    (key) => filters[key] !== EMPTY[key],
  ).length;

  // The list is newest first; cut into days, each under its own label, in that same order.
  const days: { day: string; items: HistoryItem[] }[] = [];
  for (const item of shown) {
    const day = item.day ?? item.date.slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }

  return (
    <div className="page-stack">
      {/* History is one of Progress's sections (ADR 0034), so it is chosen where they are, with
          one control beside it for everything that narrows the list. The panel is a sheet, so
          it opens inside the screen on any device. */}
      <ProgressSections
        value="history"
        action={
          <FilterSheet
            title="Filters"
            summary={formatDateRange(range.from, range.to)}
            count={active}
          >
            {(close) => (
              <>
                <DateRangeFields from={range.from} to={range.to} onApplied={close} />
                <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  <Field label="Activity">
                    <Select
                      value={filters.kind}
                      onChange={(e) => apply({ ...filters, kind: e.target.value })}
                    >
                      <option value="all">All activity</option>
                      <option value="workout">Workouts</option>
                      <option value="run">Runs</option>
                      {/* Shown only where they exist, so a lifter's filter list stays short. */}
                      {kinds.has("cycling") && <option value="cycling">Rides</option>}
                      {kinds.has("swimming") && <option value="swimming">Swims</option>}
                      <option value="recovery">Recovery</option>
                    </Select>
                  </Field>
                  <Field label="Gym">
                    <Select
                      value={filters.gym}
                      onChange={(e) => apply({ ...filters, gym: e.target.value, machine: "" })}
                    >
                      <option value="">All gyms</option>
                      {gyms.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Exercise">
                    <Select
                      value={filters.exercise}
                      onChange={(e) => apply({ ...filters, exercise: e.target.value, machine: "" })}
                    >
                      <option value="">All exercises</option>
                      {choices.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {/* The machine list depends on the gym and exercise above it. */}
                  <Field label="Machine">
                    <Select
                      value={filters.machine}
                      onChange={(e) => apply({ ...filters, machine: e.target.value })}
                    >
                      <option value="">All machines</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {active > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => apply(EMPTY)}>
                    Clear filters
                  </Button>
                )}
              </>
            )}
          </FilterSheet>
        }
      />

      <div className="space-y-4">
        {truncated && (
          <p role="status" className="text-sm text-warning">
            Showing the newest records only. Narrow the dates to see every entry; the totals in
            Overview cover the whole period whatever this list shows.
          </p>
        )}
        <p role="status" className="font-data text-sm font-medium text-ink-muted tabular-nums">
          {shown.length} {shown.length === 1 ? "entry" : "entries"}
        </p>
        {shown.length ? (
          days.map((group) => (
            <section key={group.day} className="min-w-0">
              <h2 className="pb-1 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
                {dayLabel(group.day, today)}
              </h2>
              <ul className="box-rows">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <HistoryRow item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No matching activity"
            description="Try a wider date range or clear the filters."
            action={
              active > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => apply(EMPTY)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
