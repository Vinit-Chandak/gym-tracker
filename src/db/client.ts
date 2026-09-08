import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "../lib/env";
import * as schema from "./schema";

export type AppDatabase = PostgresJsDatabase<typeof schema>;

function needsSsl(url: string): boolean {
  return !/localhost|127\.0\.0\.1/.test(url);
}

/** Creates a postgres.js-backed Drizzle client. `prepare: false` is required behind Supabase's transaction pooler. */
export function createDatabase(url: string, options: { max?: number } = {}): AppDatabase {
  const client = postgres(url, {
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: 20,
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
