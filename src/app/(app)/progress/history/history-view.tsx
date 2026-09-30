"use client";

import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import type { Route } from "next";

import { DateRangeFields } from "@/components/date-range-fields";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { CalendarDays, ChevronRight, Rest } from "@/components/ui/icons";
import { Field } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS, ROW_CLASS } from "@/components/ui/link-row";
import { Select } from "@/components/ui/select";
import { SportChip } from "@/components/ui/sport-chip";
import type { ActivitySport } from "@/domain/activity";
import { formatDateRange } from "@/lib/format";
import { TONE_FILL, TONE_SOFT, type Tone } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

import { ProgressSections } from "../progress-sections";

export type HistoryItem = {
  id: string;
  /** Every sport history holds, plus the recovery readings that are not training at all. */
  kind: "workout" | "run" | "cycling" | "swimming" | "recovery";
  date: string;
  title: string;
  /** The row's one line: when, where and how, as a phrase. */
  subtitle: string;
  href?: Route<`/workouts/${string}` | `/runs/${string}` | `/training/activities/${string}`>;
  /** The figure the entry is remembered by, "5.2 km" or "14 sets", or empty. */
  meta: string;
  gymId: string | null;
  exercises: { id: string; name: string; machineId: string | null; machineName: string | null }[];
  /** Words the athlete wrote with it, under the line. */
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

/** The sport each kind of row is drawn in; recovery is not a sport and has a hue of its own. */
const KIND_SPORT: Record<Exclude<HistoryItem["kind"], "recovery">, ActivitySport> = {
  workout: "strength",
  run: "running",
  cycling: "cycling",
  swimming: "swimming",
};

const KIND_TONE: Record<HistoryItem["kind"], Tone> = {
  workout: "lift",
  run: "run",
  cycling: "ride",
  swimming: "swim",
  recovery: "rose",
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

/** A row's lead: the sport's chip, or recovery's own in its rose wash. */
function KindChip({ kind }: { kind: HistoryItem["kind"] }) {
  if (kind === "recovery")
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-control",
          TONE_SOFT.rose,
        )}
      >
        <Rest />
      </span>
    );
  return <SportChip sport={KIND_SPORT[kind]} size="sm" />;
}

/** "5.2 km": the figure in the display face and its unit small beside it. */
function Figure({ text }: { text: string }) {
  const [value, ...unit] = text.split(" ");
  return (
    <span className="max-w-[40%] shrink-0 text-right tabular-nums">
      <span className="font-display text-[1.375rem] leading-none font-extrabold">{value}</span>
      {unit.length > 0 && (
        <>
          {" "}
          <span className="text-sm font-semibold text-ink-muted">{unit.join(" ")}</span>
        </>
      )}
    </span>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const content: ReactNode = (
    <>
      <KindChip kind={item.kind} />
      <span className="min-w-0 flex-1">
        {/* The chip is a picture; the kind is said in words for anyone not seeing it. */}
        <span className="sr-only">{KIND_LABELS[item.kind]}</span>
        <span className="block font-semibold [overflow-wrap:anywhere]">{item.title}</span>
        <span
          data-readings={item.kind === "recovery" ? "" : undefined}
          className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums"
        >
          {item.subtitle}
        </span>
        {item.recovery && (
          <span
            data-notes=""
            className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-subtle"
          >
            {item.recovery}
          </span>
        )}
      </span>
      {item.meta && <Figure text={item.meta} />}
    </>
  );
  // A row that opens nothing is a recovery reading; its date is kept for tools that read the list.
  if (!item.href)
    return (
      <div className={ROW_CLASS} data-date={item.date}>
        {content}
      </div>
    );
  return (
    <Link prefetch="intent" href={item.href} className={PRESSABLE_ROW_CLASS}>
      {content}
      <ChevronRight className="-ml-1 shrink-0 text-ink-subtle" aria-hidden />
    </Link>
  );
}

export function HistoryView({
  range,
  items,
  gyms,
  truncated,
}: {
  /** The dates the server read, changed from inside the filter sheet. */
  range: { from: string; to: string };
  items: HistoryItem[];
  gyms: { id: string; name: string }[];
  /** The list stops at the newest records the server would send, short of the whole range. */
  truncated: boolean;
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
  // The kinds as pills over the list, the quickest filter there is; rides and swims only
  // where there are some, as in the sheet.
  const kindOptions: { value: string; label: string; tone?: Tone }[] = [
    { value: "all", label: "All" },
    { value: "workout", label: "Workouts", tone: KIND_TONE.workout },
    { value: "run", label: "Runs", tone: KIND_TONE.run },
    ...(kinds.has("cycling")
      ? [{ value: "cycling", label: "Rides", tone: KIND_TONE.cycling }]
      : []),
    ...(kinds.has("swimming")
      ? [{ value: "swimming", label: "Swims", tone: KIND_TONE.swimming }]
      : []),
    { value: "recovery", label: "Recovery", tone: KIND_TONE.recovery },
  ];

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

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {kindOptions.map((option) => {
          const pressed = filters.kind === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => apply({ ...filters, kind: option.value })}
              className={cn(
                "min-h-11 pressable rounded-chip px-4 text-sm font-semibold",
                pressed
                  ? option.tone
                    ? TONE_FILL[option.tone]
                    : "bg-ink text-canvas"
                  : "bg-surface text-ink-muted active:bg-surface-raised",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {truncated && (
          <p role="status" className="text-sm text-warning">
            Showing the newest records only. Narrow the dates to see every entry; the totals in
            Overview cover the whole period whatever this list shows.
          </p>
        )}
        <p role="status" className="pl-1 text-sm text-ink-muted tabular-nums">
          {shown.length} {shown.length === 1 ? "entry" : "entries"}
        </p>
        {shown.length ? (
          <ul className="box-rows">
            {shown.map((item) => (
              <li key={item.id}>
                <HistoryRow item={item} />
              </li>
            ))}
          </ul>
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
