import { and, asc, eq, ne, or, sql } from "drizzle-orm";

import { profileDirectory } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { normaliseUsername } from "@/domain/username";

/** A person as the directory shows them: nothing an account keeps to itself. */
export type DirectoryProfile = typeof profileDirectory.$inferSelect;

/**
 * Reads about other accounts (ADR 0026). Everything here goes through `profile_directory` or a
 * security-definer lookup; nothing reads `profiles` for anyone but the signed-in user.
 */

/** How many people a search may return. Enough for a friend group; too few to enumerate. */
export const SEARCH_LIMIT = 20;

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

/** node-postgres and PGlite wrap the rows in `{ rows }`; postgres.js, in the scripts, does not. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] }).rows ?? [];
}

/** One person by handle, or null. The handle is made canonical first, as the URL may not be. */
export async function getDirectoryProfile(
  tx: DbOrTx,
  username: string,
): Promise<DirectoryProfile | null> {
  const [row] = await tx
    .select()
    .from(profileDirectory)
    .where(eq(profileDirectory.username, normaliseUsername(username)))
    .limit(1);
  return row ?? null;
}

/**
 * The exact-email lookup: one person, only if they allow being found this way, and never the
 * address itself. Runs as `security definer` in the database, which is what keeps a wrong
 * guess from confirming anything.
 */
export async function findByEmail(tx: DbOrTx, email: string): Promise<DirectoryProfile | null> {
  const [row] = await tx
    .select({
      id: sql<string>`id`,
      username: sql<string>`username`,
      displayName: sql<string | null>`display_name`,
      joinedAt: sql<Date>`joined_at`,
      followApproval: sql<boolean>`follow_approval`,
      followers: sql<number>`followers`,
      following: sql<number>`following`,
    })
    .from(sql`public.find_profile_by_email(${email})`);
  return row ? { ...row, joinedAt: new Date(row.joinedAt) } : null;
}

/** LIKE's own wildcards, and its escape, taken literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Finds people (plan §3.4). A query with `@` in it is an exact email; anything else matches
 * the start of a username or the start of any word of a display name, case-insensitively,
 * twenty at most, never the viewer.
 */
export async function searchDirectory(
  tx: DbOrTx,
  viewerId: string,
  query: string,
): Promise<DirectoryProfile[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  if (trimmed.includes("@")) {
    const person = await findByEmail(tx, trimmed);
    return person && person.id !== viewerId ? [person] : [];
  }
  const prefix = `${escapeLike(trimmed.toLowerCase())}%`;
  return tx
    .select()
    .from(profileDirectory)
    .where(
      and(
        ne(profileDirectory.id, viewerId),
        or(
          sql`${profileDirectory.username} like ${prefix}`,
          // A space in front makes "the start of any word" one LIKE: "% jo%".
          sql`(' ' || lower(coalesce(${profileDirectory.displayName}, ''))) like ${`% ${prefix}`}`,
        ),
      ),
    )
    .orderBy(
      asc(sql`lower(coalesce(${profileDirectory.displayName}, ${profileDirectory.username}))`),
      asc(profileDirectory.username),
    )
    .limit(SEARCH_LIMIT);
}
