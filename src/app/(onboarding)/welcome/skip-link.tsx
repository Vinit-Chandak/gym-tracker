import { completeOnboardingAction } from "@/server/actions/profile";

/** Leaves setup at any point; Settings and the tabs cover everything that was skipped. */
export function SkipLink({ label = "Skip for now" }: { label?: string }) {
  return (
    <form action={completeOnboardingAction} className="flex justify-center">
      <button
        type="submit"
        className="min-h-11 px-4 text-sm text-ink-subtle underline-offset-4 hover:underline"
      >
        {label}
      </button>
    </form>
  );
}
