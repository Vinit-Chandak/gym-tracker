import { and, count, eq, sql } from "drizzle-orm";

import { equipmentInstances, gyms, profiles, programs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

export type Profile = typeof profiles.$inferSelect;

/** The profile row as stored, or null. Only reads; `ensureProfile` is what writes. */
export async function readProfile(db: DbOrTx, id: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return row ?? null;
}

/** The name a sign-in carries, as a profile would store it. */
function signInName(displayName?: string | null): string | null {
  return displayName?.trim().slice(0, 80) || null;
}

/**
 * Whether `ensureProfile` has anything to write for this account: no row yet, or an empty
 * name the sign-in's own name can fill. Anything else is a plain read.
 */
export function profileNeedsWrite(existing: Profile | null, displayName?: string | null): boolean {
  return existing === null || (!existing.displayName?.trim() && signInName(displayName) !== null);
}

/**
 * Returns the profile, creating it for users who signed up before the trigger existed. A
 * created row gets its username the way the trigger gives one: generated from the email, in
 * the database, where the uniqueness check lives.
 */
export async function ensureProfile(
  db: DbOrTx,
  user: { id: string; email: string | null; displayName?: string | null },
): Promise<Profile> {
  const existing = await readProfile(db, user.id);
  const displayName = signInName(user.displayName);
  if (existing) {
    if (profileNeedsWrite(existing, user.displayName)) {
      const [repaired] = await db
        .update(profiles)
        .set({ displayName })
        .where(
          and(eq(profiles.id, user.id), sql`nullif(trim(${profiles.displayName}), '') is null`),
        )
        .returning();
      if (repaired) return repaired;
    }
    return existing;
  }
  const emailLocalPart = (user.email ?? "").split("@")[0] ?? "";
  await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email,
      displayName,
      username: sql`public.generate_username(${emailLocalPart}, null)`,
    })
    .onConflictDoNothing({ target: profiles.id });
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) throw new Error("Profile could not be created");
  return profile;
}

/**
 * The answers a profile is still missing, named as the profile screen asks for them.
 *
 * Setup asks for all of these, but accounts that existed before it did — or before a field was
 * added — are complete in their own terms and must not be shooed back through onboarding. The
 * Profile tab says what is missing instead, and the profile form is where it gets filled in.
 */
export function missingProfileDetails(
  profile: Pick<
    Profile,
    "displayName" | "bodyWeightKg" | "heightCm" | "dateOfBirth" | "trainingGoal"
  >,
): string[] {
  const missing: string[] = [];
  if (!profile.displayName) missing.push("name");
  if (profile.bodyWeightKg === null) missing.push("body weight");
  if (profile.heightCm === null) missing.push("height");
  if (profile.dateOfBirth === null) missing.push("date of birth");
  if (profile.trainingGoal === null) missing.push("training goal");
  return missing;
}

/** "height", "height and date of birth", "height, date of birth and training goal". */
export function listSentence(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
  // Four independent counts and lookups, sent together.
  const [[gymRow], [equipmentRow], [defaultGym], [program]] = await Promise.all([
    db.select({ n: count() }).from(gyms).where(eq(gyms.userId, userId)),
    db.select({ n: count() }).from(equipmentInstances).where(eq(equipmentInstances.userId, userId)),
    db
      .select({ name: gyms.name })
      .from(gyms)
      .where(and(eq(gyms.userId, userId), eq(gyms.isDefault, true)))
      .limit(1),
    db
      .select({
        id: programs.id,
        name: programs.name,
        startDate: programs.startDate,
        endDate: programs.endDate,
        weeks: programs.weeks,
      })
      .from(programs)
      .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
      .limit(1),
  ]);

  return {
    gymCount: gymRow?.n ?? 0,
    equipmentCount: equipmentRow?.n ?? 0,
    defaultGymName: defaultGym?.name ?? null,
    activeProgram: program ?? null,
  };
}
