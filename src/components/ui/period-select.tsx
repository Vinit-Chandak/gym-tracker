"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { PERIOD_LABELS, PERIODS, type Period } from "@/domain/period";

/**
 * The one time control a social screen has (plan §3.1): 7 / 30 / 90 days / 1 year, carried
 * in the URL so the server answers with only the data asked for and a refresh keeps the
 * choice. The page dims while the next period loads rather than blanking.
 */
export function PeriodSelect({ value }: { value: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const choose = (period: Period) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    startTransition(() =>
      router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false }),
    );
  };
  return (
    <div className={pending ? "opacity-60 transition-opacity" : undefined} aria-busy={pending}>
      <SegmentedControl
        name="period"
        aria-label="Period"
        columns={4}
        value={value}
        onChange={choose}
        options={PERIODS.map((period) => ({ value: period, label: PERIOD_LABELS[period] }))}
      />
    </div>
  );
}
