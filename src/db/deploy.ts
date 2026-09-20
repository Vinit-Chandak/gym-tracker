import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import {
  backfillMultisport,
  formatReconciliation,
  MULTISPORT_BACKFILL,
  reconcileMultisport,
} from "./backfill-multisport";
import {
  backfillSharedStats,
  hasBackfillRun,
  SHARED_STATS_BACKFILL,
} from "./backfill-shared-stats";
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
 * upserts shared rows by slug. The exceptions are the named one-off backfills, each run the
 * first time a deploy finds it has not run and recorded so it never runs unasked again. They
 * write derived rows — the friends' shared stats, and the canonical activity beside every run
 * and session — that the app would have written itself had the tables existed at the time.
 *
 * The multisport one belongs here rather than in an operator's hands. A migration that adds
 * the tables and a deploy that does not populate them leaves an athlete looking at an empty
 * History and concluding the release lost their training. The two halves are one change, so
 * they ship together.
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
    const db = drizzle(client, { schema });
    const reference = await seedReferenceData(db);
    console.log(
      `  shared library seeded: ${reference.equipmentTypes} equipment types, ` +
        `${reference.exercises} exercises, ${reference.equipmentOptions} equipment options, ` +
        `${reference.warmupProtocols} warm-up protocols`,
    );
    if (await hasBackfillRun(db, SHARED_STATS_BACKFILL)) {
      console.log("  shared stats backfill already ran; skipped");
    } else {
      const backfill = await backfillSharedStats(db);
      console.log(
        `  shared stats backfilled once: ${backfill.accounts} accounts, ` +
          `${backfill.workouts} workouts, ${backfill.runs} runs, ` +
          `${backfill.readings} body weight readings`,
      );
    }
    await deployMultisportBackfill(db);
  } finally {
    await client.end();
  }
}

/**
 * The canonical parent beside every legacy run and session (plan §10.2).
 *
 * Additive and resumable: it skips what the ledger says it already wrote, so a second deploy
 * over the same data writes nothing. It marks itself done only after a complete pass, which is
 * why the check above is enough to keep it from running on every build.
 *
 * Two outcomes leave the marker unwritten on purpose, and neither stops the build. An account
 * the audit blocked has two records disagreeing about the same fact, and a person has to say
 * which is right; refusing to deploy over that would take the whole application down for one
 * duplicated planned run. A reconciliation that does not balance means some legacy rows have
 * no canonical parent yet — history reads short, not wrong. Both retry on the next deploy, and
 * both say so loudly enough to be found in the build log.
 */
async function deployMultisportBackfill(db: Parameters<typeof backfillMultisport>[0]) {
  if (await hasBackfillRun(db, MULTISPORT_BACKFILL)) {
    console.log("  multisport backfill already ran; skipped");
    return;
  }
  const summary = await backfillMultisport(db);
  console.log(
    `  multisport backfilled: ${summary.accounts} accounts, ${summary.runActivities} runs ` +
      `and ${summary.strengthActivities} sessions given a canonical activity, ` +
      `${summary.occurrences} occurrences, ` +
      `${summary.resolutions + summary.legacyResolutions} resolutions`,
  );
  if (summary.blockedAccounts > 0)
    console.warn(
      `  ${summary.blockedAccounts} account(s) held back by a blocking audit issue. ` +
        "Run `npm run db:audit:multisport`, resolve them, and the next deploy tries again.",
    );
  const reconciliation = await reconcileMultisport(db);
  if (!reconciliation.ok) {
    console.warn("  multisport reconciliation does not balance; the backfill is not marked done:");
    console.warn(formatReconciliation(reconciliation));
  }
}

main().catch((error: unknown) => {
  // Failing the build is the point: shipping code the database cannot serve is what broke.
  console.error("\nDatabase deploy failed, so the build was stopped.\n");
  console.error(error);
  process.exit(1);
});
