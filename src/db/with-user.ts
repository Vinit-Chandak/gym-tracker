import { sql } from "drizzle-orm";

import type { Db, Tx } from "./types";

/**
 * Error codes for a connection that died underneath us rather than a failed query: the driver's
 * own codes plus the socket-level ones Node reports.
 */
const CONNECTION_ERROR_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

/** Whether an error (or any error it wraps) says the database connection was lost. */
export function isConnectionError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Runs `fn` in a transaction that behaves like a PostgREST request for `userId`:
 * the JWT claims are set and the role is switched to `authenticated`, so every Row Level
 * Security policy applies to the app's own queries. This is the only way application code
 * should touch user-owned tables.
 *
 * Pooled connections sit idle between requests, and the pooler or a paused server instance can
 * drop one silently. That only shows on first use, so when opening the transaction fails with a
 * connection error before any of `fn` has run, it is retried once on a fresh connection. Nothing
 * of the caller's work is ever repeated.
 */
export async function withUser<T>(
  db: Db,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { readOnly?: boolean } = {},
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const attempt = async (retriesLeft: number): Promise<T> => {
    let userWorkStarted = false;
    try {
      return await db.transaction(
        async (tx) => {
          await tx.execute(
            sql`select set_config('request.jwt.claims', ${claims}, true),
                     set_config('request.jwt.claim.sub', ${userId}, true),
                     set_config('request.jwt.claim.role', 'authenticated', true),
                     set_config('role', 'authenticated', true)`,
          );
          userWorkStarted = true;
          return fn(tx);
        },
        options.readOnly ? { accessMode: "read only" } : undefined,
      );
    } catch (error) {
      if (retriesLeft > 0 && !userWorkStarted && isConnectionError(error)) {
        return attempt(retriesLeft - 1);
      }
      throw error;
    }
  };
  return attempt(1);
}
