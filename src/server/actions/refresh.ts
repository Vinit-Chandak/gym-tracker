"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth";

/**
 * Renders the screen the browser is showing again and sends it back with the reply, for a copy
 * made before the latest of this browser's set changes (ADR 0030).
 *
 * It also discards the browser's prefetched screens. The tabs are prefetched whole, data and all
 * (bottom-nav.tsx), so a prefetched Today or Progress can predate the same set; `refresh()`
 * keeps prefetches, and the render it asked for was answered from that older prefetch. Only a
 * revalidation clears them. The tabs are prefetched again in the background afterwards, which
 * happens once each time a screen is found older than a set, not once per set.
 */
export async function refreshScreenAction(): Promise<void> {
  await requireUser();
  revalidatePath("/", "layout");
}
