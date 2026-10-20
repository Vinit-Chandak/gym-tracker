import { redirect } from "next/navigation";

import { requireOnboardedUser } from "@/server/auth";

/**
 * The old Runs tab (plan §3.2), which is now a compatibility alias and nothing else.
 *
 * Running lives in Plan with every other sport (ADR 0058). A bookmark, a stored coach link or
 * a tab left open since before the move lands here and is sent to the place the same
 * information now lives, rather than to a second Runs screen that would drift from it.
 */
export default async function RunsPage() {
  await requireOnboardedUser();
  // Plan carries no sport filter, so the alias lands on Plan itself. `next.config.ts` sends the
  // address there first; this is for a build that runs without its redirects.
  redirect("/plan");
}
