import type { Route } from "next";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { listGyms } from "@/server/repositories/gyms";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

/**
 * Where a setup that was left unfinished picks up again.
 *
 * The steps are sequential, so what has been saved says how far it got: a gym means the first
 * two steps were answered, machines at that gym mean the third was. Sending everyone back to
 * step one instead made an athlete repeat themselves, and the gym step — which shows nothing
 * about the gym already added — took the same name a second time and made a duplicate.
 */
export async function onboardingEntry(userId: string): Promise<Route> {
  // A sport-only account never reaches the gym steps, so their absence says nothing about how
  // far setup got. It picks up at the plan step instead (SCOPE-02).
  const sports = await withUser(getDb(), userId, (tx) => enabledSportsFor(tx, userId), {
    readOnly: true,
  });
  if (!sports.includes("strength")) return "/welcome/programme";
  const gyms = await withUser(getDb(), userId, (tx) => listGyms(tx, userId), { readOnly: true });
  if (gyms.length === 0) return "/welcome";
  const gym = gyms.find((candidate) => candidate.isDefault) ?? gyms[0]!;
  if (gym.equipmentCount === 0) return `/welcome/equipment?gym=${gym.id}` as Route;
  return "/welcome/programme";
}
