import { and, asc, desc, eq, sql } from "drizzle-orm";

import { gyms } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { GymInput } from "@/server/validation/gyms";

export type GymRow = typeof gyms.$inferSelect;
export type GymListItem = GymRow & { equipmentCount: number };

/** All of a user's gyms: active first, default first, then by name. */
export async function listGyms(db: DbOrTx, userId: string): Promise<GymListItem[]> {
  const rows = await db
    .select({
      gym: gyms,
      // Plain SQL on purpose: inside a select list Drizzle drops table qualifiers, which
      // would turn `gym_id = id` into a comparison of the inner table with itself.
      equipmentCount: sql<number>`(
        select count(*) from equipment_instances e
        where e.gym_id = gyms.id and e.is_active
      )::int`,
    })
    .from(gyms)
    .where(eq(gyms.userId, userId))
    .orderBy(desc(gyms.isActive), desc(gyms.isDefault), asc(gyms.name));
  return rows.map((row) => ({ ...row.gym, equipmentCount: row.equipmentCount }));
}

export async function getGym(db: DbOrTx, userId: string, gymId: string): Promise<GymRow | null> {
  const [row] = await db
    .select()
    .from(gyms)
    .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Creates a gym. The first real gym a user creates becomes their default automatically. */
export async function createGym(db: DbOrTx, userId: string, input: GymInput): Promise<GymRow> {
  const existing = await db
    .select({ slug: gyms.slug, isDefault: gyms.isDefault })
    .from(gyms)
    .where(eq(gyms.userId, userId));
  const slug = uniqueSlug(
    slugify(input.name),
    existing.map((g) => g.slug),
  );
  const hasDefault = existing.some((g) => g.isDefault);
  const [row] = await db
    .insert(gyms)
    .values({
      userId,
      name: input.name,
      slug,
      kind: input.kind,
      address: input.address,
      notes: input.notes,
      isDefault: !hasDefault && input.kind === "gym",
    })
    .returning();
  if (!row) throw new Error("Gym insert returned no row");
  return row;
}

export async function updateGym(
  db: DbOrTx,
  userId: string,
  gymId: string,
  input: GymInput,
): Promise<GymRow | null> {
  const [row] = await db
    .update(gyms)
    .set({ name: input.name, kind: input.kind, address: input.address, notes: input.notes })
    .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
    .returning();
  return row ?? null;
}

/** Makes `gymId` the only default gym. Returns false if the gym is unknown or archived. */
export async function setDefaultGym(db: DbOrTx, userId: string, gymId: string): Promise<boolean> {
  const gym = await getGym(db, userId, gymId);
  if (!gym || !gym.isActive) return false;
  await db
    .update(gyms)
    .set({ isDefault: false })
    .where(and(eq(gyms.userId, userId), eq(gyms.isDefault, true)));
  await db
    .update(gyms)
    .set({ isDefault: true })
    .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)));
  return true;
}

/** Archives or restores a gym. Archiving also drops its default flag. History is untouched. */
export async function setGymActive(
  db: DbOrTx,
  userId: string,
  gymId: string,
  isActive: boolean,
): Promise<boolean> {
  const [row] = await db
    .update(gyms)
    .set(isActive ? { isActive: true } : { isActive: false, isDefault: false })
    .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
    .returning({ id: gyms.id });
  return row !== undefined;
}
