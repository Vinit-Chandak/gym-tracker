"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ActivitySport } from "@/domain/activity";

/** One week at a time; the URL keeps back, refresh and shared links on that week. */
export function ProgrammeWeekPicker({
  sport,
  week,
  weeks,
  currentWeek,
}: {
  sport: ActivitySport;
  week: number;
  weeks: number;
  currentWeek: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useOptimistic(week);
  const [pending, startNavigation] = useTransition();
  const choose = (next: number) => {
    startNavigation(() => {
      setChosen(next);
      router.replace(`/training/programmes/${sport}?week=${next}` as Route, { scroll: false });
    });
  };
  return (
    <div className="programme-week-picker" aria-busy={pending}>
      <Button
        variant="secondary"
        aria-label="Previous week"
        disabled={chosen <= 1 || pending}
        onClick={() => choose(chosen - 1)}
      >
        ←
      </Button>
      <Select
        aria-label="Programme week"
        value={chosen}
        onChange={(event) => choose(Number(event.target.value))}
      >
        {Array.from({ length: weeks }, (_, index) => index + 1).map((value) => (
          <option key={value} value={value}>
            Week {value} of {weeks}
            {value === currentWeek ? " · Current" : ""}
          </option>
        ))}
      </Select>
      <Button
        variant="secondary"
        aria-label="Next week"
        disabled={chosen >= weeks || pending}
        onClick={() => choose(chosen + 1)}
      >
        →
      </Button>
    </div>
  );
}
