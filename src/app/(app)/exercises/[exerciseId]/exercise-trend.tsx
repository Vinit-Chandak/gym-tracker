"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { DateRangeFields } from "@/components/date-range-fields";
import { StrengthTrend, type SeriesOption, type StrengthMetric } from "@/components/strength-trend";
import { Card } from "@/components/ui/card";
import { FilterSheet } from "@/components/ui/filter-sheet";
import type { PerformanceSeries } from "@/domain/analytics";
import { formatDateRange } from "@/lib/format";

/**
 * The Progress screen's strength card, on the page of the exercise it is already about.
 *
 * Progress asks which exercise first; here that answer is the screen you are on, so the
 * chooser is the one thing left out and everything under it — the five measurements, the
 * headline number, the machine in the corner and the line itself — is the same component
 * drawing the same numbers. The range lives in the URL, so the filter and the machine are
 * both answered by the server rather than by a second copy of the data in the browser.
 */
export function ExerciseTrend({
  range,
  machines,
  selected,
}: {
  range: { from: string; to: string };
  machines: SeriesOption[];
  selected: PerformanceSeries | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [metric, setMetric] = useState<StrengthMetric>("load");

  const chooseSeries = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("series", id);
    startTransition(() => router.replace(`${pathname}?${next}` as Route, { scroll: false }));
  };

  const dates = formatDateRange(range.from, range.to);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">Progress</h2>
          <p className="text-sm text-ink-muted tabular-nums">{dates}</p>
        </div>
        <FilterSheet title="Filters" summary={dates}>
          {(close) => <DateRangeFields from={range.from} to={range.to} onApplied={close} />}
        </FilterSheet>
      </div>
      <StrengthTrend
        selected={selected}
        machines={machines}
        metric={metric}
        onMetricChange={setMetric}
        onChooseSeries={chooseSeries}
        pending={pending}
        empty={
          <p className="text-sm text-ink-muted">
            Nothing logged for this exercise in this range. Finish a workout with logged sets, or
            widen the dates, to see trends.
          </p>
        }
      />
    </Card>
  );
}
