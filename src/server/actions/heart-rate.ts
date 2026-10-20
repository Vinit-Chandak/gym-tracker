"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { customFloorsProblem, resolveHeartRate } from "@/domain/heart-rate";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { heartRateSettingsOf, highestRecentRunHeartRate } from "@/server/repositories/heart-rate";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import { heartRateInputSchema } from "@/server/validation/heart-rate";
import { ageOn } from "@/lib/units";

/** Every screen that reads a zone: the page itself, a run's page and a plan's targets. */
function revalidateZones(): void {
  revalidatePath("/profile/heart-rate");
  revalidatePath("/training/activities/[activityId]", "page");
  revalidatePath("/training/programme/occurrences/[occurrenceId]", "page");
  revalidatePath("/today");
}

/**
 * Saves the heart-rate page (ADR 0059).
 *
 * A maximum typed in is the athlete's word, dated today; the same number left as it was keeps
 * where it came from, so saving the resting rate does not turn a recorded maximum into an
 * entered one. A blank maximum hands it back to the runs and the age estimate. Custom floors
 * are checked against the maximum that will be in use once this saves.
 */
export async function saveHeartRateAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(heartRateInputSchema, formData);
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const refused = await withUser(
    getDb(),
    user.id,
    async (tx): Promise<Record<string, string> | null> => {
      const profile = await ensureProfile(tx, user);
      const today = todayInTimeZone(profile.timeZone);
      const unchanged = input.maxHeartRate !== null && input.maxHeartRate === profile.maxHeartRate;
      const max = {
        maxHeartRate: input.maxHeartRate,
        maxHeartRateSource:
          input.maxHeartRate === null
            ? null
            : unchanged
              ? (profile.maxHeartRateSource ?? "entered")
              : ("entered" as const),
        maxHeartRateOn:
          input.maxHeartRate === null ? null : unchanged ? profile.maxHeartRateOn : today,
      };
      const floors = [input.zone1, input.zone2, input.zone3, input.zone4, input.zone5];
      const custom = input.zoneMethod === "custom";
      const settings = {
        ...heartRateSettingsOf(profile),
        ...max,
        restingHeartRate: input.restingHeartRate,
        zoneMethod: input.zoneMethod,
        maxHeartRateAuto: input.maxHeartRateAuto,
        customZoneFloors: custom ? floors.map((value) => value ?? 0) : profile.heartRateZoneFloors,
      };
      const age = profile.dateOfBirth === null ? null : ageOn(profile.dateOfBirth, today);
      const resolved = resolveHeartRate(
        settings,
        age,
        await highestRecentRunHeartRate(tx, user.id, today),
      );
      if (input.restingHeartRate !== null && resolved && input.restingHeartRate >= resolved.max)
        return { restingHeartRate: "Your resting heart rate must be below your maximum." };
      if (custom) {
        if (!resolved)
          return {
            maxHeartRate: "Enter your maximum heart rate, or add your date of birth, to set zones.",
          };
        if (floors.some((value) => value === null))
          return { zone1: "Give a starting heart rate for each of the five zones." };
        const problem = customFloorsProblem(floors as number[], resolved.max);
        if (problem) return { zone1: problem };
      }
      await tx
        .update(profiles)
        .set({
          ...max,
          restingHeartRate: input.restingHeartRate,
          heartRateZoneMethod: input.zoneMethod,
          maxHeartRateAuto: input.maxHeartRateAuto,
          heartRateZoneFloors: custom ? (floors as number[]) : profile.heartRateZoneFloors,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, user.id));
      return null;
    },
  );
  if (refused) return { fieldErrors: refused, values: formValues(formData) };
  await profileChanged(user.id);
  revalidateZones();
  return {};
}

/**
 * Takes the highest reading of the year's runs as the maximum: the one-tap answer to "your runs
 * say 196, your maximum says 188". Stored as recorded, with the run's date.
 */
export async function adoptRunMaxHeartRateAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const adopted = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    const highest = await highestRecentRunHeartRate(tx, user.id, todayInTimeZone(profile.timeZone));
    if (!highest) return false;
    await tx
      .update(profiles)
      .set({
        maxHeartRate: highest.bpm,
        maxHeartRateSource: "observed",
        maxHeartRateOn: highest.on,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));
    return true;
  });
  if (adopted) {
    await profileChanged(user.id);
    revalidateZones();
  }
  return { ok: adopted };
}
