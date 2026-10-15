import { sql } from "drizzle-orm";

import type { DbOrTx } from "@/db/types";

/**
 * A zone as Postgres spells it, or null where Postgres does not know it. Postgres dates the
 * graphs' workouts in the account's zone, so a zone it cannot read would stop them drawing; and
 * its spelling is the zone database's ("asia/kolkata" is "Asia/Kolkata"), which is what a data
 * migration matches a profile's zone by.
 */
export async function knownTimeZone(db: DbOrTx, zone: string): Promise<string | null> {
  const [row] = await db
    .select({ name: sql<string>`name` })
    .from(sql`pg_timezone_names`)
    .where(sql`lower(name) = lower(${zone})`)
    .orderBy(sql`name = ${zone} desc`)
    .limit(1);
  return row?.name ?? null;
}
