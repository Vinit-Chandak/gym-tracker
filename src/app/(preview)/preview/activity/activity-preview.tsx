"use client";

import { CyclingForm } from "@/components/activities/cycling-form";
import { RunningForm } from "@/components/activities/running-form";
import { SwimmingForm } from "@/components/activities/swimming-form";
import type { FormState } from "@/server/validation/form";

/** Nothing is saved: the form answers its own Save with what it was given. */
const keep = async (state: FormState) => state;

const START = { startedAt: "2026-10-20T07:00", entryDate: "2026-10-20", latestDate: "2026-10-20" };

/** A log form as a phone shows it, empty or holding a run already typed. */
export function ActivityPreview({
  sport,
  filled,
}: {
  sport: "running" | "cycling" | "swimming";
  filled: boolean;
}) {
  const shared = { action: keep, submissionKey: "preview", submitLabel: "Save" };
  if (sport === "cycling")
    return (
      <CyclingForm
        {...shared}
        initial={{
          ...START,
          environment: "outdoor",
          ...(filled
            ? { distanceValue: "42.3", distanceUnit: "km", hours: "1", minutes: "28" }
            : {}),
        }}
      />
    );
  if (sport === "swimming")
    return (
      <SwimmingForm
        {...shared}
        initial={{
          ...START,
          environment: "pool",
          ...(filled ? { distanceMethod: "manual", distanceValue: "1500", minutes: "32" } : {}),
        }}
      />
    );
  return (
    <RunningForm
      {...shared}
      initial={{
        ...START,
        environment: "outdoor",
        ...(filled
          ? { distanceValue: "5.2", distanceUnit: "km", minutes: "25", seconds: "30" }
          : {}),
      }}
    />
  );
}
