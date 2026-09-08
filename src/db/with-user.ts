import { sql } from "drizzle-orm";

import type { Db, Tx } from "./types";

/**
 * Runs `fn` in a transaction that behaves like a PostgREST request for `userId`:
 * the JWT claims are set and the role is switched to `authenticated`, so every Row Level
 * Security policy applies to the app's own queries. This is the only way application code
 * should touch user-owned tables.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true),
                 set_config('request.jwt.claim.sub', ${userId}, true),
                 set_config('request.jwt.claim.role', 'authenticated', true)`,
    );
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
