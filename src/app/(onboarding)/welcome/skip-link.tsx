import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { completeOnboardingAction } from "@/server/actions/profile";

/**
 * Leaves one step. Skipping the gym goes straight to the plan, since machines belong to a
 * gym; skipping machines goes to the plan too. It used to end setup altogether and land the
 * athlete on Today, so anyone who skipped a gym was never offered a programme at all.
 */
export function SkipLink({ href, label = "Skip for now" }: { href: Route; label?: string }) {
  return (
    <div className="flex justify-center">
      <Link
        href={href}
        className="min-h-11 px-4 py-3 text-sm text-ink-subtle underline-offset-4 hover:underline"
      >
        {label}
      </Link>
    </div>
  );
}

/** Ends setup from the last step: everything skipped is in Settings. */
export function FinishSetupLink({ label }: { label: string }) {
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
