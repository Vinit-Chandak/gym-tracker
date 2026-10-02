import { PageHeader } from "@/components/shell/page-header";
import { Wordmark } from "@/components/shell/wordmark";
import { Check } from "@/components/ui/icons";
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

function indexOf(current: OnboardingStep): number {
  return ONBOARDING_STEPS.findIndex((step) => step.key === current);
}

/** The opening line of every step: the app's own name, and where in setup this is. */
export function StepHeader({ current }: { current: OnboardingStep }) {
  return (
    <PageHeader
      title={<Wordmark />}
      meta={`Step ${indexOf(current) + 1} of ${ONBOARDING_STEPS.length}`}
    />
  );
}

/**
 * Where the athlete is in setup: the five steps as a row of cells on a ruled strip, the way
 * the cycle strip marks the day on Today. Steps already done are inked in, the current one is
 * under the highlighter, and the ones still to come are outlined.
 */
export function Steps({ current }: { current: OnboardingStep }) {
  const index = indexOf(current);
  return (
    <ol aria-label="Setup progress" className="grid grid-cols-5 gap-1 py-3 rule-top rule-bottom">
      {ONBOARDING_STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li
            key={step.key}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-control border px-0.5 py-1 text-center",
              active
                ? "border-highlight-strong bg-highlight text-on-highlight"
                : done
                  ? "border-ink bg-ink text-canvas"
                  : "border-line text-ink-muted",
            )}
          >
            <span
              aria-hidden
              className="flex h-4 items-center font-data text-sm leading-none font-semibold tabular-nums"
            >
              {done ? <Check className="!size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[11px] leading-tight [overflow-wrap:anywhere]",
                active && "font-medium",
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
