import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";

/**
 * Keeping a server instance warm between visits (ADR 0049).
 *
 * On the Hobby plan Vercel stops an instance a few minutes after its last request, and the next
 * tap then waits for a new one: about a second and a half before the first byte. A scheduler
 * that requests `/warm` every minute keeps one instance alive, and this module keeps that
 * instance's database connections open too, so the first real tap after a quiet hour finds a
 * running process, loaded screens and a pool that has already shaken hands with the database.
 */

/**
 * How many pooled connections a ping holds open. A cold load of a tab opens three at once: the
 * account gate's profile read, the shell's open-workout read and the page's own transaction.
 * Each new one costs a TCP, TLS and password exchange with the pooler (30–40 ms in production).
 */
export const WARM_CONNECTIONS = 3;

/**
 * The shortest time between two database touches on one instance, however often `/warm` is
 * asked. The page is public, so a burst of requests costs at most one round of `select 1` per
 * instance per interval, and never more connections than the pool already allows.
 */
export const WARM_DATABASE_INTERVAL_MS = 30_000;

export type DatabaseWarmth = "touched" | "recent" | "failed";

/**
 * A throttled database touch: `run` is called at most once per `intervalMs`, and callers that
 * arrive while it is running share its answer. A failure is reported, not thrown, and does not
 * count as a touch, so the next ping tries again.
 */
export function databaseWarmer(
  run: () => Promise<unknown>,
  intervalMs = WARM_DATABASE_INTERVAL_MS,
): (now?: number) => Promise<DatabaseWarmth> {
  let lastTouched = Number.NEGATIVE_INFINITY;
  let pending: Promise<DatabaseWarmth> | null = null;
  return (now = Date.now()) => {
    if (pending) return pending;
    if (now - lastTouched < intervalMs) return Promise.resolve("recent");
    pending = run().then(
      () => {
        lastTouched = now;
        return "touched" as const;
      },
      () => "failed" as const,
    );
    void pending.finally(() => {
      pending = null;
    });
    return pending;
  };
}

/**
 * `select 1` on `WARM_CONNECTIONS` pooled connections at once. Started together, each takes its
 * own connection (opening it if the pool has none idle), and each goes back to the pool to wait
 * for the next request. No table is read, so no user's data is involved and no row-level
 * security context is needed.
 */
async function touchConnections(): Promise<void> {
  const db = getDb();
  await Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => db.execute(sql`select 1`)));
}

export const warmDatabase = databaseWarmer(touchConnections);
