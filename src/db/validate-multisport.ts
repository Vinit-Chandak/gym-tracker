import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import { auditMultisport, type AuditIssue } from "./multisport-audit";
import { formatReconciliation, reconcileMultisport } from "./backfill-multisport";

import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import type { DbOrTx } from "./types";

/**
 * M2: the constraints that can only be declared true once the data is (plan §§10.1, 10.4).
 *
 * These are deliberately not in the migration journal. Everything in the journal runs on
 * deploy, and a constraint that runs on deploy is a constraint that either fails the build or
 * gets loosened until it stops failing it — neither of which is validation. M2 is an operator
 * step in the ordered rollout: after the final delta backfill, after reconciliation passes,
 * and before write authority moves.
 *
 * It is also gated on the audit. A shared row whose source cannot be resolved, a completion
 * naming a record that no longer exists, a link that crosses accounts: each is a fact about
 * this database that somebody has to look at. Adding the constraint anyway would mean
 * deleting or reassigning the row it trips over, and neither is ours to do (§10.3).
 *
 * Idempotent: every statement is `if not exists`, so a second run after a fixed anomaly adds
 * only what is still missing.
 */

export type ValidationCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type ValidationReport = {
  generatedAt: string;
  /** False when anything below blocks; nothing is applied in that case. */
  applied: boolean;
  checks: ValidationCheck[];
  constraints: string[];
  blocking: AuditIssue[];
};

/**
 * What M2 actually adds.
 *
 * One constraint, not a list, because M1 already carries the owner and the sport in the keys
 * of everything it created: an activity cannot name another account's occurrence, or an
 * occurrence of another sport, because `activities_occurrence_revision_fk` would refuse it.
 * What M1 could not constrain is the one relation that reaches back into a table older than
 * the migration — a shared projection's canonical source — because until the backfill has run
 * and reconciled, those ids do not all exist yet (plan §9.2).
 *
 * The checks below still cover the invariants M1 enforces. They cost one count each and they
 * are the evidence an operator reads before moving write authority; a constraint holding is
 * worth saying out loud at the moment it matters.
 */
const CONSTRAINTS: { name: string; table: string; statement: string; why: string }[] = [
  {
    name: "shared_session_stats_activity_fk",
    table: "shared_session_stats",
    why: "A shared projection must name a source its own owner holds.",
    statement: `alter table public.shared_session_stats
      add constraint shared_session_stats_activity_fk
      foreign key (user_id, activity_id)
      references public.activities (user_id, id) on delete cascade`,
  },
];

async function count(db: DbOrTx, statement: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(statement);
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return Number((rows[0] as { value: number | string } | undefined)?.value ?? 0);
}

/**
 * The rows that would make a constraint fail, counted before it is added.
 *
 * Counted rather than discovered by the failure, because a failed `alter table` says only
 * that something is wrong. An operator needs to know how much and where before deciding
 * whether this is a bug in the backfill or a fact about the data.
 */
export async function validationChecks(db: DbOrTx): Promise<ValidationCheck[]> {
  const orphanShared = await count(
    db,
    sql`select count(*)::int as value from public.shared_session_stats s
        where s.activity_id is not null
          and not exists (
            select 1 from public.activities a
            where a.id = s.activity_id and a.user_id = s.user_id)`,
  );
  const crossOwnerOccurrence = await count(
    db,
    sql`select count(*)::int as value from public.activities a
        join public.planned_occurrences o on o.id = a.occurrence_id
        where a.occurrence_id is not null
          and (o.user_id <> a.user_id or o.sport <> a.sport)`,
  );
  const danglingOccurrence = await count(
    db,
    sql`select count(*)::int as value from public.activities a
        where a.occurrence_id is not null
          and not exists (select 1 from public.planned_occurrences o where o.id = a.occurrence_id)`,
  );
  const duplicateResolution = await count(
    db,
    sql`select count(*)::int as value from (
          select a.occurrence_id from public.activities a
          where a.occurrence_id is not null
          group by a.occurrence_id having count(*) > 1) d`,
  );
  return [
    {
      name: "shared projections resolve to an owned activity",
      ok: orphanShared === 0,
      detail:
        orphanShared === 0
          ? "Every shared row with a canonical source names one this owner holds."
          : `${orphanShared} shared rows name an activity their owner does not have. Reconcile them; do not delete them to fit the constraint.`,
    },
    {
      name: "every linked occurrence is the same owner and sport",
      ok: crossOwnerOccurrence === 0,
      detail:
        crossOwnerOccurrence === 0
          ? "No activity answers for another account's or another sport's occurrence."
          : `${crossOwnerOccurrence} activities link across an owner or a sport boundary. Isolate the link; never reassign the record.`,
    },
    {
      name: "no activity names an occurrence that does not exist",
      ok: danglingOccurrence === 0,
      detail:
        danglingOccurrence === 0
          ? "Every linked occurrence is present."
          : `${danglingOccurrence} activities name a missing occurrence.`,
    },
    {
      name: "one actual per occurrence",
      ok: duplicateResolution === 0,
      detail:
        duplicateResolution === 0
          ? "No occurrence has two activities answering for it."
          : `${duplicateResolution} occurrences have more than one actual. Only an authoritative completion may decide which (§10.3).`,
    },
  ];
}

async function constraintExists(db: DbOrTx, name: string): Promise<boolean> {
  return (
    (await count(
      db,
      sql`select count(*)::int as value from pg_constraint
          where conname = ${name} and connamespace = 'public'::regnamespace`,
    )) > 0
  );
}

/**
 * Runs the whole gate: audit, reconciliation, pre-checks, then the constraints.
 *
 * `dryRun` stops after the checks, which is what a rehearsal wants — the report is the point,
 * and it is the same report either way.
 */
export async function validateMultisport(
  db: DbOrTx,
  options: { dryRun?: boolean; userId?: string } = {},
): Promise<ValidationReport> {
  const generatedAt = new Date().toISOString();
  const audit = await auditMultisport(db, options.userId ? { userId: options.userId } : {});
  const blocking = audit.issues.filter((issue) => issue.blocking);
  const reconciliation = await reconcileMultisport(db, options);
  const checks: ValidationCheck[] = [
    {
      name: "audit reports no blocking anomaly",
      ok: blocking.length === 0,
      detail:
        blocking.length === 0
          ? "Nothing the migration refused to guess at is still open."
          : `${blocking.length} blocking categories are open: ${blocking.map((issue) => issue.category).join(", ")}.`,
    },
    {
      name: "reconciliation passes",
      ok: reconciliation.ok,
      detail: reconciliation.ok
        ? "Every required equality holds."
        : "Reconciliation failed. Do not switch write authority.",
    },
    ...(await validationChecks(db)),
  ];

  const blocked = checks.some((check) => !check.ok);
  if (blocked || options.dryRun)
    return { generatedAt, applied: false, checks, constraints: [], blocking };

  const applied: string[] = [];
  for (const constraint of CONSTRAINTS) {
    if (await constraintExists(db, constraint.name)) continue;
    await db.execute(sql.raw(constraint.statement));
    applied.push(constraint.name);
  }
  return { generatedAt, applied: true, checks, constraints: applied, blocking };
}

export function formatValidation(report: ValidationReport): string {
  return [
    `Multisport M2 validation — ${report.generatedAt}`,
    "",
    ...report.checks.map(
      (check) => `  [${check.ok ? "ok " : "FAIL"}] ${check.name}\n         ${check.detail}`,
    ),
    "",
    report.applied
      ? report.constraints.length > 0
        ? `Applied: ${report.constraints.join(", ")}.`
        : "Applied: nothing to add; the constraints are already in place."
      : "Not applied. Resolve the failures above, or re-run without --dry-run once they are clear.",
  ].join("\n");
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  const dryRun = process.argv.includes("--dry-run");
  try {
    const db = drizzle(client, { schema });
    console.log(`Multisport M2${dryRun ? " (dry run)" : ""} → ${describeTarget(url)}`);
    console.log(formatReconciliation(await reconcileMultisport(db)));
    const report = await validateMultisport(db, { dryRun });
    console.log(formatValidation(report));
    if (!report.applied && !dryRun) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("validate-multisport.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
