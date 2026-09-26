"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { profileChanged } from "@/server/queries/request-profile";
import { deleteSportStats, rebuildSportStats } from "@/server/repositories/shared-stats";
import { PRIVACY_KEYS, type PrivacyKey } from "@/server/validation/privacy";

/** Saves one of the four switches. The profile is cached, so the write goes through `profileChanged`. */
export async function setPrivacyAction(key: PrivacyKey, value: boolean): Promise<void> {
  if (!PRIVACY_KEYS.includes(key) || typeof value !== "boolean") throw new Error("Not a setting");
  const user = await requireUser();
  await withUser(getDb(), user.id, async (tx) => {
    await tx
      .update(profiles)
      .set({ [key]: value })
      .where(eq(profiles.id, user.id));
    if (key === "shareTraining") {
      if (value) {
        // These projections are written only with consent. Include activities recorded while
        // the global switch was off, subject to each sport's existing opt-in.
        await rebuildSportStats(tx, user.id, "cycling");
        await rebuildSportStats(tx, user.id, "swimming");
      } else {
        await deleteSportStats(tx, user.id, "cycle");
        await deleteSportStats(tx, user.id, "swim");
      }
    }
  });
  await profileChanged(user.id);
  revalidatePath("/profile/privacy");
  // Whether you approve requests changes what the follow button says on your page.
  revalidatePath("/u/[username]", "page");
}
