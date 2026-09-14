import { sql } from "drizzle-orm";

import type { DbOrTx } from "@/db/types";

/**
 * Reads about other accounts (ADR 0026). Everything here goes through `profile_directory` or a
 * security-definer lookup; nothing reads `profiles` for anyone but the signed-in user.
 */

/**
 * Whether a username is valid, unreserved and unused. The one query in the app that runs
 * outside `withUser`: the signup form asks before an account exists, so there is no user to
 * run as. The function is `security definer`, returns a boolean and nothing else, and reveals
 * only what the unique index would reveal on submit.
 */
export async function usernameAvailable(db: DbOrTx, candidate: string): Promise<boolean> {
  const result = await db.execute(sql`select public.username_available(${candidate}) as ok`);
  return rowsOf<{ ok: boolean }>(result)[0]?.ok === true;
}

/** postgres.js hands back the rows themselves; PGlite wraps them in `{ rows }`. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] }).rows ?? [];
}
