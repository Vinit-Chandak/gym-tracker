import type { Metadata } from "next";
import { connection } from "next/server";

import { warmDatabase } from "@/server/keep-warm";

export const metadata: Metadata = { title: "Warm" };

/**
 * The tab pages and the workout, loaded but never rendered. Vercel serves every page from one
 * function, so the instance this request lands on is the one the next tap will use; loading
 * these here means that tap does not wait for their modules to be read and run first. A screen
 * that fails to load fails on its own when it is opened; it never fails this page.
 */
function loadScreens() {
  return Promise.allSettled([
    import("@/app/(app)/today/page"),
    import("@/app/(app)/training/page"),
    import("@/app/(app)/food/page"),
    import("@/app/(app)/progress/page"),
    import("@/app/(app)/profile/page"),
    import("@/app/(app)/workouts/[sessionId]/page"),
  ]);
}

/**
 * What a keep-warm scheduler requests every minute (ADR 0049). It is a page, not a route
 * handler, because Vercel runs route handlers in a function of their own; it is public, because
 * a scheduler has no session; and it reads nothing of anyone's.
 */
export default async function WarmPage() {
  // Rendered on every request: a prerendered copy would be served without waking anything.
  await connection();
  const [database] = await Promise.all([warmDatabase(), loadScreens()]);
  return <p data-database={database}>Warm.</p>;
}
