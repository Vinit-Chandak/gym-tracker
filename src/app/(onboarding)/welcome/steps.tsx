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
 * Where the user is in the first run (boards Welcome to Plan): five dots, the current one
 * drawn long, those done and the current in ink, those to come in grey. Each says its step
 * and how far it has got, aloud.
 */
export function Steps({ current }: { current: OnboardingStep }) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="steps" aria-label="Setup progress">
      {ONBOARDING_STEPS.map((step, i) => (
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
