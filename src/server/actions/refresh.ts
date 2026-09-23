"use server";

import { refresh } from "next/cache";

import { requireUser } from "@/server/auth";

/**
 * Renders the screen the browser is showing again and sends it back with the reply, for a copy
 * made before the latest of this browser's set changes (ADR 0030).
 *
 * `router.refresh()` fetches the same render, but it also throws away every prefetched link,
 * which the browser then fetches again: eight more requests on Today. A refresh from an action
 * drops only the browser's copies of what the server rendered, as the set actions' own refresh
 * did before.
 */
export async function refreshScreenAction(): Promise<void> {
  await requireUser();
  refresh();
}
