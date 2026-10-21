import type { Route } from "next";

import { LinkButton } from "@/components/ui/button";
import type { ActivitySport } from "@/domain/activity";

/**
 * With the coach, while it takes no new programmes and nothing was answered yet: one short line
 * and its action, since building one by hand is still open. Every sport says it alike.
 */
export function CoachPaused({ sport }: { sport: ActivitySport }) {
  return (
    <div className="space-y-3">
      <p>The coach is not taking new programmes right now.</p>
      <LinkButton href={`/plan/new?sport=${sport}` as Route} variant="secondary">
        Build it yourself
      </LinkButton>
    </div>
  );
}
