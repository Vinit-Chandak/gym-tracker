"use client";

import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Route } from "next";

import { DateRangeFields } from "@/components/date-range-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { Field } from "@/components/ui/input";
import { LinkRow, List } from "@/components/ui/link-row";
import { Select } from "@/components/ui/select";
import { formatDateRange } from "@/lib/format";
import { CalendarDays } from "@/components/ui/icons";

export type HistoryItem = {
  id: string;
  kind: "workout" | "run" | "recovery";
  date: string;
  title: string;
  subtitle: string;
  href?: Route<`/workouts/${string}` | `/runs/${string}`>;
  meta: string;
  gymId: string | null;
  exercises: { id: string; name: string; machineId: string | null; machineName: string | null }[];
  recovery?: string;
};

type Filters = { kind: string; gym: string; exercise: string; machine: string };

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

export function HistoryView({
  range,
  items,
  gyms,
}: {
  /** The dates the server read, changed from inside the filter sheet. */
  range: { from: string; to: string };
  items: HistoryItem[];
  gyms: { id: string; name: string }[];
}) {
  // Filtering happens on data the page already has, so it stays local and immediate. The
  // URL is updated through the History API purely so that coming back from an entry
  // restores the same view, without that costing a fetch on every change.
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => fromSearch(searchParams));

  const apply = (next: Filters) => {
    setFilters(next);
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
    <div className="space-y-3">
      {/* One control for everything that narrows the list, with what it currently says
          beside it. The panel is a sheet, so it opens inside the screen on any device. */}
      <div className="flex min-h-11 items-center justify-between gap-2 pl-1">
        <p role="status" className="min-w-0 text-sm text-ink-muted tabular-nums">
          {shown.length} {shown.length === 1 ? "entry" : "entries"}
        </p>
        <FilterSheet title="Filters" summary={formatDateRange(range.from, range.to)} count={active}>
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
      </div>

      {shown.length ? (
        <List>
          {shown.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <LinkRow
                  href={item.href}
                  title={item.title}
                  subtitle={item.subtitle}
                  meta={item.meta}
                  badge={<Badge>{item.kind === "run" ? "Run" : "Workout"}</Badge>}
                />
              ) : (
                <div className="space-y-1 px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {item.title} <Badge>Recovery</Badge>
                  </p>
                  <p className="text-sm text-ink-muted">{item.subtitle}</p>
                </div>
              )}
              {item.recovery && <p className="px-4 pb-3 text-xs text-ink-muted">{item.recovery}</p>}
            </li>
          ))}
        </List>
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
  );
}
