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
    <Link href={href} className="text-action">
      {label}
    </Link>
  );
}

/** Ends setup from the last step: everything skipped is on the Profile tab. */
export function FinishSetupLink({ label }: { label: string }) {
  return (
    <form action={completeOnboardingAction}>
      <button type="submit" className="text-action w-full">
        {label}
      </button>
    </form>
  );
}
