import type { SetupStep, SetupStepKey } from "@/lib/setup-path";

/**
 * Where the athlete is in setup: a dot for each step of their own path (`setupSteps`), the
 * current one drawn long, those done and the current in ink, those to come in grey. Each says
 * its step and how far it has got, aloud. A path of one step has nothing to count, so it shows
 * no dots.
 */
export function Steps({ steps, current }: { steps: readonly SetupStep[]; current: SetupStepKey }) {
  if (steps.length < 2) return <span />;
  const index = Math.max(
    0,
    steps.findIndex((step) => step.key === current),
  );
  return (
    <ol className="steps" aria-label="Setup progress">
      {steps.map((step, i) => (
        <li
          key={step.key}
          aria-label={`${step.label}, ${i < index ? "completed" : i === index ? "current step" : "not started"}`}
          data-state={i < index ? "done" : i === index ? "current" : "todo"}
          className="steps-dot"
        />
      ))}
    </ol>
  );
}
