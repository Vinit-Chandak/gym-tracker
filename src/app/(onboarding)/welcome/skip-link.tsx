import type { Route } from "next";

import { Button, LinkButton } from "@/components/ui/button";
import { completeOnboardingAction } from "@/server/actions/profile";

/**
 * Leaves one step: a word in the pen, under the block it skips. Skipping the gym goes
 * straight to the plan, since machines belong to a gym; skipping machines goes to the plan
 * too. It used to end setup altogether and land the athlete on Today, so anyone who skipped
 * a gym was never offered a programme at all.
 */
export function SkipLink({ href, label = "Skip for now" }: { href: Route; label?: string }) {
  return (
    <div className="flex justify-center">
      <LinkButton href={href} variant="ghost">
        {label}
      </LinkButton>
    </div>
  );
}

/** Ends setup from the last step: everything skipped is on the Profile tab. */
export function FinishSetupLink({ label }: { label: string }) {
  return (
    <form action={completeOnboardingAction} className="flex justify-center">
      <Button type="submit" variant="ghost">
        {label}
      </Button>
    </form>
  );
}
