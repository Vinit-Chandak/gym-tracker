import { redirect } from "next/navigation";

import { requireOnboardedUser } from "@/server/auth";

/**
 * The old Runs tab (plan §3.2), which is now a compatibility alias and nothing else.
 *
 * Running lives in the shared Training surface with every other sport. A bookmark, a stored
 * coach link or a tab left open since before the move lands here and is sent to the place the
 * same information now lives, rather than to a second Runs screen that would drift from it.
 */
export default async function RunsPage() {
  await requireOnboardedUser();
  // Training no longer carries a sport filter — the one control that set it asked the same
  // question the log screen then asked again — so the alias lands on the surface itself.
  redirect("/training");
}
