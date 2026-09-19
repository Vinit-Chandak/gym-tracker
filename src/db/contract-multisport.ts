import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import { reconcileMultisport } from "./backfill-multisport";
import { CUTOVER_MARKERS, cutoverAssertions, markerAt, recordMarker } from "./multisport-cutover";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import type { DbOrTx } from "./types";

/**
 * M3: taking the old tables away, once nothing needs them (plan §11 P8, §10.4 step 9).
 *
 * Not in the migration journal, for the same reason M2 is not and a stronger one besides.
 * Everything in the journal runs on the next deploy; the compatibility windows this is gated
 * on are measured in months and start at a cutover that has not happened. A migration file
 * that drops `runs` would drop it long before any window elapsed, which is not a contraction
 * — it is data loss with a version number.
 *
 * So the SQL lives here, is tested against a real database, and is applied by an explicit
 * command that refuses while any gate is open. When the windows have run, the operator's
 * step is `npm run db:contract:multisport`, and its refusal is as much the point as its
 * success.
 *
 * What it does *not* remove is as deliberate as what it does. `daily_recovery` stays: it was
 * only ever declared beside runs in TypeScript, and moving a declaration is not a reason to
 * drop a table. The migration ledger stays, because a report written a year ago still says
 * `run:<uuid>` and resolving that is not a convenience — it is the difference between
 * history that reads and history that does not. The route resolvers stay for as long as
 * legitimate bookmarks do.
 */

/** Days after the switch before each surface may be retired (NAV-04, API-01). */
export const CONTRACT_WINDOWS = {
  /** Old UI links: `/runs`, `/profile/programme`, `/profile/routines`. */
  uiAliasDays: 90,
  /** The v1 read API. */
  readApiDays: 180,
  /** And, for either, this many consecutive days with no legitimate use. */
  quietDays: 30,
} as const;

export type ContractGate = { name: string; ok: boolean; detail: string };

export type ContractReport = {
  generatedAt: string;
  applied: boolean;
  gates: ContractGate[];
  dropped: string[];
};

/**
 * The structures M3 removes: the raw writers the canonical model replaced.
 *
 * `if exists` throughout, so a re-run after a partial application finishes the job rather
 * than failing on what is already gone.
 */
const DROPS: { name: string; statement: string; why: string }[] = [
  {
    name: "runs",
    why: "Every run is an activity with a running detail; the raw table is a second editable source.",
    statement: "drop table if exists public.runs",
  },
  {
    name: "program_runs",
    why: "Planned runs are occurrences with their own identity and revisions.",
    statement: "drop table if exists public.program_runs",
  },
];

async function value(db: DbOrTx, statement: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(statement);
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return Number((rows[0] as { value: number | string } | undefined)?.value ?? 0);
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Every gate, evaluated together.
 *
 * `legacyUsageAt` is the operator's input: the last time a legitimate v1 client or an old UI
 * link was actually used, from the access logs. It is not inferable from the database, and
 * guessing it would defeat the usage half of the window — so its absence is itself a failed
 * gate rather than a silent pass (OP-06).
 */
export async function contractGates(
  db: DbOrTx,
  options: { legacyUsageAt?: string | null; now?: Date } = {},
): Promise<ContractGate[]> {
  const now = options.now ?? new Date();
  const gates: ContractGate[] = [];

  const switchedAt = await markerAt(db, CUTOVER_MARKERS.authoritySwitched);
  if (switchedAt === null)
    return [
      {
        name: "authority has switched",
        ok: false,
        detail:
          "There is no switch marker. Nothing can be contracted before the canonical model is the authority.",
      },
    ];
  const elapsed = daysSince(switchedAt, now);
  gates.push({
    name: `the UI alias window (${CONTRACT_WINDOWS.uiAliasDays} days) has passed`,
    ok: elapsed >= CONTRACT_WINDOWS.uiAliasDays,
    detail: `${elapsed} days since the switch at ${switchedAt}.`,
  });
  gates.push({
    name: `the read-API window (${CONTRACT_WINDOWS.readApiDays} days) has passed`,
    ok: elapsed >= CONTRACT_WINDOWS.readApiDays,
    detail: `${elapsed} days since the switch at ${switchedAt}.`,
  });

  const usage = options.legacyUsageAt ?? null;
  gates.push({
    name: `no legitimate legacy usage for ${CONTRACT_WINDOWS.quietDays} days`,
    ok: usage !== null && daysSince(usage, now) >= CONTRACT_WINDOWS.quietDays,
    detail:
      usage === null
        ? "Pass --last-legacy-use <ISO date> from the access logs. This cannot be read from the database, and an unknown answer is not a quiet one."
        : `Last legitimate legacy use ${daysSince(usage, now)} days ago, at ${usage}.`,
  });

  const assertions = await cutoverAssertions(db);
  const failed = assertions.filter((assertion) => !assertion.ok);
  gates.push({
    name: "no legacy writer survived the switch",
    ok: failed.length === 0,
    detail:
      failed.length === 0
        ? "Nothing has been written to a retired table since authority moved."
        : failed.map((assertion) => assertion.detail).join(" "),
  });

  const reconciliation = await reconcileMultisport(db);
  gates.push({
    name: "reconciliation still passes",
    ok: reconciliation.ok,
    detail: reconciliation.ok
      ? "Every required equality holds against the current data."
      : "Reconciliation fails. Do not drop anything.",
  });

  // A dropped table cannot be read back, so the ledger that resolves old identifiers has to
  // be there first. Without it, `run:<uuid>` in a year-old report resolves to nothing.
  const links = await value(
    db,
    sql`select count(*)::int as value from public.multisport_migration_links
        where target_kind = 'activities'`,
  );
  const legacyRuns = await value(db, sql`select count(*)::int as value from public.runs`).catch(
    () => 0,
  );
  gates.push({
    name: "the identifier map covers the rows being dropped",
    ok: legacyRuns === 0 || links > 0,
    detail:
      legacyRuns === 0
        ? "The raw run table is already gone."
        : `${links} mapped activities against ${legacyRuns} raw runs. Old evidence identifiers resolve through this map after the drop.`,
  });

  return gates;
}

export async function contractMultisport(
  db: DbOrTx,
  options: { dryRun?: boolean; legacyUsageAt?: string | null; now?: Date } = {},
): Promise<ContractReport> {
  const generatedAt = new Date().toISOString();
  const gates = await contractGates(db, options);
  if (gates.some((gate) => !gate.ok) || options.dryRun)
    return { generatedAt, applied: false, gates, dropped: [] };

  const dropped: string[] = [];
  for (const drop of DROPS) {
    await db.execute(sql.raw(drop.statement));
    dropped.push(drop.name);
  }
  await recordMarker(db, CUTOVER_MARKERS.legacyContracted);
  return { generatedAt, applied: true, gates, dropped };
}

export function formatContract(report: ContractReport): string {
  return [
    `Multisport M3 contraction — ${report.generatedAt}`,
    "",
    ...report.gates.map(
      (gate) => `  [${gate.ok ? "ok " : "HOLD"}] ${gate.name}\n         ${gate.detail}`,
    ),
    "",
    report.applied
      ? `Dropped: ${report.dropped.join(", ")}. Recovery, the identifier map and the route resolvers were kept.`
      : "Not applied. Every gate above has to be open; a window that has not elapsed is not a gate to be argued with.",
  ].join("\n");
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  const dryRun = process.argv.includes("--dry-run");
  const usageIndex = process.argv.indexOf("--last-legacy-use");
  const legacyUsageAt = usageIndex >= 0 ? (process.argv[usageIndex + 1] ?? null) : null;
  try {
    const db = drizzle(client, { schema });
    console.log(`Multisport M3${dryRun ? " (dry run)" : ""} → ${describeTarget(url)}`);
    const report = await contractMultisport(db, { dryRun, legacyUsageAt });
    console.log(formatContract(report));
    if (!report.applied && !dryRun) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("contract-multisport.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
