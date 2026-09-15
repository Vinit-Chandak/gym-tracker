"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { SPORT_LABELS, TRAINING_SPORTS, type TrainingSport } from "@/domain/sport-scope";

/**
 * Lifting / Running (decision 4), carried in the URL like the period beside it, so the server
 * answers with one sport's rows and a refresh keeps the choice. A third sport is a new
 * value in `TRAINING_SPORTS`, not a new control.
 */
export function SportSwitch({
  value,
  resets = [],
}: {
  value: TrainingSport;
  /** Parameters that belong to the sport, dropped with it: a lifting metric means nothing to running. */
  resets?: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const choose = (sport: TrainingSport) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sport", sport);
    for (const key of resets) params.delete(key);
    startTransition(() =>
      router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false }),
    );
  };
  return (
    <div className={pending ? "opacity-60 transition-opacity" : undefined} aria-busy={pending}>
      <SegmentedControl
        name="sport"
        aria-label="Sport"
        columns={TRAINING_SPORTS.length}
        value={value}
        onChange={choose}
        options={TRAINING_SPORTS.map((sport) => ({ value: sport, label: SPORT_LABELS[sport] }))}
      />
    </div>
  );
}
