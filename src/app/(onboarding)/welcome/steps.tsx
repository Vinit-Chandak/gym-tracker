import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const ONBOARDING_STEPS = [
  { key: "profile", label: "You" },
  { key: "gym", label: "Gym" },
  { key: "equipment", label: "Machines" },
  { key: "programme", label: "Plan" },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"];

/** Where the user is in the first-run flow. Four dots, not a progress bar: it is short. */
export function Steps({ current }: { current: OnboardingStep }) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="flex items-center gap-2" aria-label="Setup progress">
      {ONBOARDING_STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                done && "bg-accent/20 text-accent",
                active && "bg-accent text-on-accent",
                !done && !active && "bg-surface-raised text-ink-subtle",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "w-full truncate text-center text-[11px]",
                active ? "font-medium text-ink" : "text-ink-subtle",
              )}
            >
              {step.label}
            </span>
            <span className="sr-only">
              {active ? "current step" : done ? "completed" : "not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
