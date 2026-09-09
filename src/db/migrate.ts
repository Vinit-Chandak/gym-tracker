import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getMigrationDatabaseUrl } from "../lib/env";

export const MIGRATIONS_FOLDER = "src/db/migrations";

/**
 * Key for the advisory lock held while migrating. Two deploys finishing at once would
 * otherwise both find the same migration unapplied and both try to apply it.
 */
const MIGRATION_LOCK_KEY = 4_017_260_915;

/**
 * Notices Postgres raises every single run, because the migrator's own bookkeeping is created
 * with `if not exists`. Printing them in a build log only buries the errors worth reading.
 */
const ROUTINE_NOTICES = new Set(["42P06", "42P07"]);

/** A single-connection client for DDL. Supabase's session pooler, not the transaction pooler. */
export function createMigrationClient(url: string) {
  return postgres(url, {
    max: 1,
    prepare: false,
    onnotice: (notice) => {
      if (!ROUTINE_NOTICES.has(notice.code ?? "")) console.warn(notice.message);
    },
    ...(/localhost|127\.0\.0\.1/.test(url) ? {} : { ssl: "require" as const }),
  });
}

/** The database a connection string points at, with the credentials left out of the logs. */
export function describeTarget(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}${port ? `:${port}` : ""}${pathname}`;
  } catch {
    return "the configured database";
  }
}

/**
 * Applies every migration the database has not seen yet, one deploy at a time.
 * Safe to call repeatedly: already-applied migrations are skipped.
 */
export async function runMigrations(client: ReturnType<typeof createMigrationClient>) {
  const db = drizzle(client);
  await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
  }
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  try {
    await runMigrations(client);
    console.log(`Migrations applied to ${describeTarget(url)}.`);
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing it for the helpers above must not migrate anything.
if (process.argv[1]?.endsWith("migrate.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
