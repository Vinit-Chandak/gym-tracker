import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { completeOnboardingAction } from "@/server/actions/profile";

/** The quiet way out of a step: a text button, well clear of the step's own pill. */
const SKIP_CLASS =
  "inline-flex min-h-11 items-center rounded-chip px-4 text-callout font-semibold text-ink-muted underline-offset-4 transition-colors duration-[var(--ov-duration-feedback)] hover:text-ink hover:underline active:bg-surface-raised";

/**
 * Leaves one step. Skipping the gym goes straight to the plan, since machines belong to a
 * gym; skipping machines goes to the plan too. It used to end setup altogether and land the
 * athlete on Today, so anyone who skipped a gym was never offered a programme at all.
 */
export function SkipLink({ href, label = "Skip for now" }: { href: Route; label?: string }) {
  return (
    <div className="flex justify-center">
      <Link href={href} className={SKIP_CLASS}>
        {label}
      </Link>
    </div>
  );
}

/** Ends setup from the last step: everything skipped is on the Profile tab. */
export function FinishSetupLink({ label }: { label: string }) {
  return (
    <form action={completeOnboardingAction} className="flex justify-center">
      <button type="submit" className={SKIP_CLASS}>
        {label}
      </button>
    </form>
  );
}
