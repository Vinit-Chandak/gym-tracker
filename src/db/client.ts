import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "../lib/env";
import * as schema from "./schema";

export type AppDatabase = PostgresJsDatabase<typeof schema>;

function needsSsl(url: string): boolean {
  return !/localhost|127\.0\.0\.1/.test(url);
}

/**
 * How long an unused connection stays open, in seconds.
 *
 * A new connection costs a TCP, TLS and password handshake before its first statement. With the
 * old 20-second limit nearly every set logged after a rest paid that again. Five minutes covers a
 * whole workout; a connection the pooler dropped in the meantime is noticed on first use and the
 * transaction retried on a fresh one (see `with-user.ts`).
 */
export const IDLE_TIMEOUT_SECONDS = 300;

/** Creates a postgres.js-backed Drizzle client. `prepare: false` is required behind Supabase's transaction pooler. */
export function createDatabase(url: string, options: { max?: number } = {}): AppDatabase {
  const client = postgres(url, {
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    // Probe idle sockets often enough that a dead one is closed before it is handed out.
    keep_alive: 30,
    connect_timeout: 10,
    ...(needsSsl(url) ? { ssl: "require" as const } : {}),
  });
  return drizzle(client, { schema });
}

const globalForDb = globalThis as unknown as { __appDatabase?: AppDatabase };

/** Process-wide client for the running app (cached across hot reloads in development). */
export function getDb(): AppDatabase {
  globalForDb.__appDatabase ??= createDatabase(getDatabaseUrl());
  return globalForDb.__appDatabase;
}
