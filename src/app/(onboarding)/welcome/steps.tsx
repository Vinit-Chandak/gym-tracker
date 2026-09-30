import type { ReactNode } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

export const ONBOARDING_STEPS = [
  { key: "profile", label: "You" },
  // What you train decides which of the next two steps you are asked at all: a gym and its
  // machines belong to lifting, and a swimmer is not sent looking for one (SCOPE-02).
  { key: "sports", label: "Sports" },
  { key: "gym", label: "Gym" },
  { key: "equipment", label: "Machines" },
  { key: "programme", label: "Plan" },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"];

/**
 * Where the user is in the first-run flow: "Step 2 of 5" over a ladder of five segments, the
 * ones behind and the current one filled. The same ladder a workout draws of its sets, so the
 * first thing a new account learns to read is the thing it will read between sets. Each step
 * keeps its name and state for a screen reader; on screen the question below says what this
 * step is, so the names would only repeat it.
 */
export function Steps({ current }: { current: OnboardingStep }) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  return (
    <div className="space-y-2 px-1">
      <p aria-hidden className="text-sm font-semibold text-ink-muted tabular-nums">
        Step {index + 1} of {ONBOARDING_STEPS.length}
      </p>
      <ol className="flex gap-1.5" aria-label="Setup progress">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li
              key={step.key}
              aria-current={active ? "step" : undefined}
              className={cn(
                "h-1.5 min-w-0 flex-1 rounded-full",
                done || active ? "bg-ink" : "bg-ink/15",
              )}
            >
              <span className="sr-only">
                {step.label}, {active ? "current step" : done ? "completed" : "not started"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A step's one question, as the screen's title in the display face, with at most a short line
 * under it. Anything that explains rather than asks goes behind the tip beside that line.
 */
export function StepHeading({
  title,
  children,
  info,
  infoLabel = "About this step",
}: {
  title: ReactNode;
  /** One short line under the question. */
  children?: ReactNode;
  info?: ReactNode;
  infoLabel?: string;
}) {
  return (
    <div className="px-1">
      <h1 className="font-display text-display-l [overflow-wrap:anywhere]">{title}</h1>
      {(children || info) && (
        // The tip's tap target is taller than the line it sits on, so it gives the height back.
        <p className="mt-2 flex items-center gap-1 text-callout leading-snug text-ink-muted">
          {children && <span className="min-w-0">{children}</span>}
          {info && (
            <InfoTip label={infoLabel} className="-my-2">
              {info}
            </InfoTip>
          )}
        </p>
      )}
    </div>
  );
}
