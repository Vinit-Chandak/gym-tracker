import { sql } from "drizzle-orm";

import { markBegin, timeSetup, timeTransaction } from "./perf";
import type { Db, Tx } from "./types";

/**
 * Error codes for a connection that died underneath us rather than a failed query: postgres.js's
 * own codes (the scripts still use it) plus the socket-level ones Node reports.
 */
const CONNECTION_ERROR_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

/**
 * node-postgres, which the app runs on, says the same things with a message and no code: the
 * server or pooler closed the connection, or a query was sent on one that had already failed.
 */
const CONNECTION_ERROR_MESSAGES = new Set([
  "Connection terminated unexpectedly",
  "Connection terminated",
  "Client has encountered a connection error and is not queryable",
]);

/** Whether an error (or any error it wraps) says the database connection was lost. */
export function isConnectionError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;
    if (CONNECTION_ERROR_MESSAGES.has(current.message)) return true;
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
 *
 * Every statement here is a network round trip (ADR 0030), so the setup is kept to the claims
 * statement plus, for a write, the athlete lock. A read-only transaction is made read-only
 * inside the claims statement rather than by a separate `SET TRANSACTION`: going read-only is
 * allowed at any point in a transaction, and every later write is refused exactly as before.
 */
export async function withUser<T>(
  db: Db,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { readOnly?: boolean } = {},
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const readOnly = options.readOnly
    ? sql`, set_config('transaction_read_only', 'on', true)`
    : sql``;
  const attempt = async (retriesLeft: number): Promise<T> => {
    let userWorkStarted = false;
    const begun = markBegin();
    try {
      return await db.transaction(async (tx) => {
        begun();
        // The canonical tables' write policies additionally require this marker, which is
        // set here, after authentication, and only for a mutating request. It is
        // transaction-local, so it cannot survive on a pooled connection, and a read-only
        // transaction explicitly clears it (plan §6.3).
        await timeSetup(() =>
          tx.execute(
            sql`select set_config('request.jwt.claims', ${claims}, true),
                     set_config('request.jwt.claim.sub', ${userId}, true),
                     set_config('request.jwt.claim.role', 'authenticated', true),
                     set_config('app.server_write', ${options.readOnly ? "" : "on"}, true),
                     set_config('role', 'authenticated', true)${readOnly}`,
          ),
        );
        // Serialize short write transactions for an athlete. Start, programme activation,
        // source edits, and coach callbacks must all see one ordered state. Read-only
        // requests keep their parallel path, and model/network work stays outside here.
        if (!options.readOnly) {
          await tx.execute(sql`select id from public.profiles where id = ${userId} for update`);
        }
        userWorkStarted = true;
        return fn(tx);
      });
    } catch (error) {
      if (retriesLeft > 0 && !userWorkStarted && isConnectionError(error)) {
        return attempt(retriesLeft - 1);
      }
      throw error;
    }
  };
  return timeTransaction(options.readOnly ? "read" : "write", () => attempt(1));
}
