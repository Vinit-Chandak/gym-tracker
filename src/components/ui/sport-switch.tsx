"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { SPORT_LABELS, TRAINING_SPORTS, type TrainingSport } from "@/domain/sport-scope";

/**
 * Lifting / Running (decision 4), carried in the URL like the period beside it, so the server
 * answers with one sport's rows and a refresh keeps the choice. A third sport is a new
 * value in `TRAINING_SPORTS`, not a new control. It offers the sports the screen's people do
 * (`sportsOnOffer`), not every sport there is; with only one there is nothing to switch, and
 * it is not drawn.
 */
export function SportSwitch({
  value,
  sports = TRAINING_SPORTS,
  resets = [],
}: {
  value: TrainingSport;
  /** The sports offered, in the switch's order, `value` among them. */
  sports?: readonly TrainingSport[];
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
  if (sports.length < 2) return null;
  return (
    <div className={pending ? "opacity-60 transition-opacity" : undefined} aria-busy={pending}>
      <SegmentedControl
        name="sport"
        aria-label="Sport"
        columns={sports.length}
        value={value}
        onChange={choose}
        options={sports.map((sport) => ({ value: sport, label: SPORT_LABELS[sport] }))}
      />
    </div>
  );
}
