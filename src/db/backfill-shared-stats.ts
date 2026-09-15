import { config as loadEnv } from "dotenv";
import { asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import {
  readRuns,
  readWorkouts,
  TRAINING_RECORD_LIMIT,
} from "../server/repositories/training-data";
import {
  writeBodyWeight,
  writeRunStats,
  writeSessionStats,
} from "../server/repositories/shared-stats";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import { bodyWeightLogs, profiles } from "./schema";
import type { DbOrTx } from "./types";

/**
 * Shared rows for history that predates the shared tables (ADR 0026, plan §5.5).
 *
 * Walks every account's finished workouts and runs, oldest first, and writes each one's
 * shared row with the same functions `finishSession` and the run writes use, so a record
 * set two years ago is detected against what came before it. Upserts on the unique keys:
 * running it twice changes nothing, and running it after more sessions have been finished
 * only rewrites rows to the same values. Also seeds each account's shared body weight from
 * its newest reading. Runs as the migration role, so it reads every account; nothing here
 * goes through RLS, which is why it lives beside the migrations and not in the app.
 *
 * `db:deploy` runs it once, on the first production deploy after the tables arrive, and
 * records that in `data_backfills` so later deploys skip it; `npm run db:backfill:shared-stats`
 * runs it again by hand whenever wanted.
 */
export const SHARED_STATS_BACKFILL = "shared_stats";

/** Whether a named backfill has completed on this database. */
export async function hasBackfillRun(db: DbOrTx, name: string): Promise<boolean> {
  const result = await db.execute(
    sql`select 1 as ran from public.data_backfills where name = ${name}`,
  );
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return rows.length > 0;
}

export type BackfillSummary = {
  accounts: number;
  workouts: number;
  runs: number;
  readings: number;
};

export async function backfillSharedStats(db: DbOrTx): Promise<BackfillSummary> {
  const summary: BackfillSummary = { accounts: 0, workouts: 0, runs: 0, readings: 0 };
  const accounts = await db
    .select({ id: profiles.id, timeZone: profiles.timeZone })
    .from(profiles)
    .orderBy(asc(profiles.createdAt));
  for (const account of accounts) {
    summary.accounts++;
    // Every finished workout, then sorted oldest first: records depend on what came before.
    const workouts = [];
    for (let page = 0; ; page++) {
      const batch = await readWorkouts(db, account.id, null, page, TRAINING_RECORD_LIMIT, {
        completedOnly: true,
      });
      workouts.push(...batch.workouts);
      if (!batch.hasMore) break;
    }
    workouts.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    for (const workout of workouts) {
      await writeSessionStats(db, account.id, workout, account.timeZone);
      summary.workouts++;
    }
    for (let page = 0; ; page++) {
      const batch = await readRuns(db, account.id, ALL_TIME, page);
      for (const run of batch.runs) {
        await writeRunStats(db, account.id, run, account.timeZone);
        summary.runs++;
      }
      if (!batch.hasMore) break;
    }
    const [newest] = await db
      .select({ weightKg: bodyWeightLogs.weightKg, measuredOn: bodyWeightLogs.measuredOn })
      .from(bodyWeightLogs)
      .where(eq(bodyWeightLogs.userId, account.id))
      .orderBy(desc(bodyWeightLogs.measuredOn))
      .limit(1);
    if (newest) {
      await writeBodyWeight(db, account.id, newest);
      summary.readings++;
    }
  }
  await db.execute(
    sql`insert into public.data_backfills (name) values (${SHARED_STATS_BACKFILL})
        on conflict (name) do update set completed_at = now()`,
  );
  return summary;
}

/** Every run there is: `readRuns` wants a window, and this one has no edges. */
const ALL_TIME = {
  from: "0001-01-01",
  to: "9999-12-31",
  start: new Date("0001-01-01T00:00:00Z"),
  end: new Date("9999-12-31T00:00:00Z"),
};

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  try {
    console.log(`Backfilling shared stats → ${describeTarget(url)}`);
    const summary = await backfillSharedStats(drizzle(client, { schema }));
    console.log(
      `  ${summary.accounts} accounts: ${summary.workouts} workouts, ${summary.runs} runs, ` +
        `${summary.readings} body weight readings`,
    );
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing it for the function above must not touch anything.
if (process.argv[1]?.endsWith("backfill-shared-stats.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
