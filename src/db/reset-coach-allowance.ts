import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import type { DbOrTx } from "./types";

/**
 * Gives every athlete their daily coach requests back, today (ops, not a feature).
 *
 * The allowance is not a number anybody stores. `assertCoachRequestAllowance` counts the
 * `coach_jobs` rows an account created since its own local midnight whose `kind` is
 * `create_program` or whose `trigger` is `gym`, and refuses the fourth. So the only way to
 * hand the allowance back is to change what that count sees.
 *
 * Nothing is deleted. Each matching row keeps its id, its status, its target and its result;
 * only `created_at` moves back by a day, out of the window the count looks at. That is a
 * deliberate lie about one timestamp, and it is the smallest one available: the alternative
 * is dropping the record of what the coach actually did.
 *
 * Safe for work in flight. `coaching-today.ts` reads a queued or claimed job by its status
 * rather than by its date, so a job still waiting to run stays on Today and still runs; the
 * only other reader of this column orders the claim queue, where a day earlier means sooner.
 * Reviews are a different `kind` and a different window, and are not touched.
 *
 * Runs as the migration role, so it sees every account; nothing here goes through RLS, which
 * is why it lives beside the migrations rather than in the app.
 */

export type AllowanceReset = {
  /** Accounts that had at least one ask counted against them today. */
  accounts: number;
  /** Rows moved out of the counting window. */
  rows: number;
};

/**
 * The asks counted against today, per account, in the account's own time zone.
 *
 * Each athlete's day starts at their own midnight, so a single UTC cut-off would give one
 * athlete back an ask they had not spent and leave another still blocked. The profile's zone
 * is the same one `assertCoachRequestAllowance` reads.
 */
const SPENT_TODAY = sql`
  select j.id
  from public.coach_jobs j
  join public.profiles p on p.id = j.user_id
  where (j.kind = 'create_program' or j.trigger = 'gym')
    and j.created_at >= date_trunc('day', now() at time zone coalesce(p.time_zone, 'UTC'))
                          at time zone coalesce(p.time_zone, 'UTC')
`;

type CountRow = { accounts: string; rows: string };

/** What the reset would do, without doing it. */
export async function countSpentToday(db: DbOrTx): Promise<AllowanceReset> {
  const result = await db.execute(sql`
    select count(*)::text as rows, count(distinct j.user_id)::text as accounts
    from public.coach_jobs j
    where j.id in (${SPENT_TODAY})
  `);
  // The driver returns the rows directly or wrapped, depending on the client in use.
  const rows: CountRow[] = Array.isArray(result)
    ? (result as CountRow[])
    : ((result as { rows?: CountRow[] }).rows ?? []);
  const row = rows[0] ?? { accounts: "0", rows: "0" };
  return { accounts: Number(row.accounts), rows: Number(row.rows) };
}

/** Moves today's asks out of the counting window. Idempotent in effect, not in timestamps. */
export async function resetCoachAllowance(db: DbOrTx): Promise<AllowanceReset> {
  const before = await countSpentToday(db);
  if (before.rows === 0) return before;
  await db.execute(sql`
    update public.coach_jobs
    set created_at = created_at - interval '1 day'
    where id in (${SPENT_TODAY})
  `);
  return before;
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  // Writing to production is the default nobody should get by accident: this reports what it
  // would change and stops, unless it is told to go ahead.
  const apply = process.argv.includes("--apply");
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  try {
    const db = drizzle(client, { schema });
    const target = describeTarget(url);
    if (!apply) {
      const pending = await countSpentToday(db);
      console.log(`Would give back ${pending.rows} asks across ${pending.accounts} accounts.`);
      console.log(`Target: ${target}. Nothing was changed — re-run with --apply to do it.`);
      return;
    }
    console.log(`Resetting today's coach allowance → ${target}`);
    const done = await resetCoachAllowance(db);
    console.log(`  ${done.rows} asks given back across ${done.accounts} accounts.`);
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing the functions above must not touch anything.
if (process.argv[1]?.endsWith("reset-coach-allowance.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
