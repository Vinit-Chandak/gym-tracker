import { redirect } from "next/navigation";

/**
 * The old Runs tab (plan §3.2), which is now a compatibility alias and nothing else.
 *
 * Running lives in the shared Training surface with every other sport. A bookmark, a stored
 * coach link or a tab left open since before the move lands here and is sent to the place the
 * same information now lives, rather than to a second Runs screen that would drift from it.
 */
export default async function RunsPage() {
  redirect("/training?sport=running");
}
