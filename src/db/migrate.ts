import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getMigrationDatabaseUrl } from "../lib/env";

export const MIGRATIONS_FOLDER = "src/db/migrations";

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ...(/localhost|127\.0\.0\.1/.test(url) ? {} : { ssl: "require" as const }),
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
