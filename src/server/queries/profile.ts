import { and, count, eq } from "drizzle-orm";

import { equipmentInstances, gyms, profiles, programs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

export type Profile = typeof profiles.$inferSelect;

/** Returns the profile, creating it for users who signed up before the trigger existed. */
export async function ensureProfile(
  db: DbOrTx,
  user: { id: string; email: string | null },
): Promise<Profile> {
  const [existing] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (existing) return existing;
  await db
    .insert(profiles)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing({ target: profiles.id });
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) throw new Error("Profile could not be created");
  return profile;
}

export type StarterStatus = {
  gymCount: number;
  equipmentCount: number;
  defaultGymName: string | null;
  activeProgram: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    weeks: number | null;
  } | null;
};

export async function getStarterStatus(db: DbOrTx, userId: string): Promise<StarterStatus> {
  const [gymRow] = await db.select({ n: count() }).from(gyms).where(eq(gyms.userId, userId));
  const [equipmentRow] = await db
    .select({ n: count() })
    .from(equipmentInstances)
    .where(eq(equipmentInstances.userId, userId));
  const [defaultGym] = await db
    .select({ name: gyms.name })
    .from(gyms)
    .where(and(eq(gyms.userId, userId), eq(gyms.isDefault, true)))
    .limit(1);
  const [program] = await db
    .select({
      id: programs.id,
      name: programs.name,
      startDate: programs.startDate,
      endDate: programs.endDate,
      weeks: programs.weeks,
    })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);

  return {
    gymCount: gymRow?.n ?? 0,
    equipmentCount: equipmentRow?.n ?? 0,
    defaultGymName: defaultGym?.name ?? null,
    activeProgram: program ?? null,
  };
}
