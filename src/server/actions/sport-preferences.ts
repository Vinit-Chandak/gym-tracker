"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, legacySportOf, type ActivitySport } from "@/domain/activity";
import { requireUser } from "@/server/auth";
import { deleteSportStats, rebuildSportStats } from "@/server/repositories/shared-stats";
import { setSportPreference } from "@/server/repositories/sport-preferences";
import { parseForm, type FormState } from "@/server/validation/form";

/**
 * Which sports this account trains (SPORT-01, SCOPE-02).
 *
 * Choosing sports is a shortcut preference: history, templates and programme commitments are
 * untouched by it, and a sport that is switched off keeps everything it has. Someone who only
 * swims never has to invent a gym to get past this.
 */

const sportsSchema = z.object({
  sports: z.preprocess(
    (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : []),
    z.array(z.enum(ACTIVITY_SPORTS)).max(ACTIVITY_SPORTS.length),
  ),
});

async function save(userId: string, chosen: readonly ActivitySport[]): Promise<void> {
  await withUser(getDb(), userId, async (tx) => {
    for (const sport of ACTIVITY_SPORTS) {
      await setSportPreference(tx, userId, sport, { enabled: chosen.includes(sport) });
    }
  });
  revalidatePath("/training");
  revalidatePath("/profile/sports");
}

/** The onboarding step. Lifting sends you to the gym setup; the other sports do not need it. */
export async function chooseSportsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(sportsSchema, formData);
  if (!parsed.success) return parsed.state;
  const chosen = parsed.data.sports;
  if (chosen.length === 0)
    return { formError: "Choose at least one sport.", values: { sports: "" } };
  await save(user.id, chosen);
  redirect(chosen.includes("strength") ? "/welcome/gym" : "/welcome/programme");
}

/**
 * Sharing one sport with followers (SOCIAL-02, AT-PRIV-05).
 *
 * Turning it on rebuilds the projection from currently consented fields only. Turning it off
 * removes the rows there and then: a projection that outlives the consent that created it is
 * the failure this exists to prevent, and "it will be gone after the next save" is not a
 * privacy control. The global switch remains the upper bound on both.
 */
export async function setSportSharingAction(sport: ActivitySport, share: boolean): Promise<void> {
  const user = await requireUser();
  // Strength and running use the global control. Their projections are not rebuilt by
  // this additional-sports endpoint, so accepting them here would erase their history.
  if ((sport !== "cycling" && sport !== "swimming") || typeof share !== "boolean")
    throw new Error("Not a sport preference");
  const legacy = legacySportOf(sport);
  await withUser(getDb(), user.id, async (tx) => {
    await setSportPreference(tx, user.id, sport, { shareStats: share });
    if (!share) await deleteSportStats(tx, user.id, legacy);
    else await rebuildSportStats(tx, user.id, sport);
  });
  for (const path of ["/profile/sports", "/profile/privacy", "/profile/friends", "/progress"])
    revalidatePath(path);
  revalidatePath("/u/[username]", "page");
}

/** The profile screen. Same rule: this changes shortcuts, and nothing that was recorded. */
export async function saveSportsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(sportsSchema, formData);
  if (!parsed.success) return parsed.state;
  if (parsed.data.sports.length === 0)
    return { formError: "Choose at least one sport.", values: { sports: "" } };
  await save(user.id, parsed.data.sports);
  return { formError: undefined };
}
