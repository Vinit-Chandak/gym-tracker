import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import { createMigrationClient, describeTarget, runMigrations } from "./migrate";
import * as schema from "./schema";
import { seedReferenceData } from "./seed/reference";

/**
 * Brings the database up to the code that is about to be served, as part of the build.
 *
 * Two things drift when only the code ships. A migration the database has not applied makes
 * every query naming a new column fail, which is a blank 500 on every screen. And the shared
 * library — equipment types, exercises, warm-ups — lives in rows, so new entries do not exist
 * until they are seeded. Both are corrected here, before the build produces anything.
 *
 * Neither step touches a single row a user owns: migrations change structure, and the seed
 * upserts shared rows by slug.
 */

/**
 * Whether this build should write to the database.
 *
 * Preview deployments are the trap. `SETUP.md` has the database variables ticked for Preview
 * as well as Production, so previews share the production database — and a preview build is
 * built from a branch nobody has merged. Migrating from there would apply an unreviewed
 * migration to everybody's data. So previews are skipped unless whoever configured them says
 * their previews have a database of their own.
 */
function shouldDeploy(): { run: boolean; because: string } {
  const environment = process.env.VERCEL_ENV;
  if (!process.env.VERCEL) {
    return { run: true, because: "not running on Vercel; treating this as a manual run" };
  }
  if (environment === "production") return { run: true, because: "production deployment" };
  if (process.env.MIGRATE_ON_PREVIEW === "1") {
    return { run: true, because: `${environment} deployment with MIGRATE_ON_PREVIEW=1` };
  }
  return {
    run: false,
    because:
      `${environment ?? "non-production"} deployment shares the production database. ` +
      "Set MIGRATE_ON_PREVIEW=1 only if this environment has a database of its own.",
  };
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const { run, because } = shouldDeploy();
  if (!run) {
    console.log(`Skipping database deploy: ${because}`);
    return;
  }

  // A production build with no connection string would otherwise deploy code against a
  // database nobody updated, which is the exact failure this step exists to prevent.
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  try {
    console.log(`Database deploy (${because}) → ${describeTarget(url)}`);
    await runMigrations(client);
    console.log("  migrations applied");
    const reference = await seedReferenceData(drizzle(client, { schema }));
    console.log(
      `  shared library seeded: ${reference.equipmentTypes} equipment types, ` +
        `${reference.exercises} exercises, ${reference.equipmentOptions} equipment options, ` +
        `${reference.warmupProtocols} warm-up protocols`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Failing the build is the point: shipping code the database cannot serve is what broke.
  console.error("\nDatabase deploy failed, so the build was stopped.\n");
  console.error(error);
  process.exit(1);
});
