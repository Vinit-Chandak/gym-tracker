import { config as loadEnv } from "dotenv";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import type { DbOrTx } from "./types";

/**
 * The read-only inventory the multisport rollout is gated on (plan §10.3, OP-02).
 *
 * Source inspection cannot say how many rows a deployed database holds, which links are
 * ambiguous, or which stored payloads predate a contract. This asks, and it only ever asks:
 * every statement is a `select`, and the report carries counts and identifiers, never an
 * athlete's measurements, notes or symptoms. An issue that the deterministic policy cannot
 * resolve on its own is marked blocking, which is what stops the backfill and the cutover
 * rather than a guess about which private activity really happened.
 */

/** A new number makes an older stored report obviously stale rather than silently comparable. */
export const MULTISPORT_AUDIT_VERSION = 1;

export type AuditCounts = {
  profiles: number;
  runs: number;
  workoutSessions: number;
  programs: number;
  activePrograms: number;
  programDays: number;
  programRuns: number;
  programSlotEvents: number;
  sessionPlans: number;
  sharedSessionStats: number;
  dailyRecovery: number;
  savedRoutines: number;
  programDrafts: number;
  coachJobs: number;
};

/**
 * What the backfill would create if it ran against this database now. Compared against the
 * real thing afterwards, which is the cardinality half of the reconciliation contract (§10.5).
 */
export type AuditProjection = {
  /** One canonical parent per raw run and per workout session. */
  activities: number;
  /** One planned occurrence per planned run; strength keeps its own sequence projection. */
  enduranceOccurrences: number;
  /** Completions that name a raw run, and so map to a logged resolution. */
  loggedResolutions: number;
  /** Completions with no raw run: legacy resolutions, never an invented activity. */
  legacyCompletedResolutions: number;
};

export type AuditIssue = {
  /** Stable identifier; the runbook and the reconciliation gates name these. */
  category: string;
  count: number;
  /** True when the deterministic policy cannot resolve it and a person must look. */
  blocking: boolean;
  description: string;
  /** Owner and source identifiers, only in operator detail mode. Never measurements. */
  references?: readonly AuditReference[];
};

export type AuditReference = { userId: string; source: string; id: string; relatedId?: string };

export type MultisportAudit = {
  auditVersion: number;
  generatedAt: string;
  /** Null when the whole database was audited; a single owner in tests and support work. */
  userId: string | null;
  counts: AuditCounts;
  projection: AuditProjection;
  issues: readonly AuditIssue[];
  /** True when at least one blocking issue was found: the backfill's gate reads this. */
  blocked: boolean;
};

export type AuditOptions = {
  /** Scope every query to one owner. Omitted, the audit covers the database. */
  userId?: string;
  /**
   * Include owner/source identifiers with each issue. For the operator's private report only:
   * the aggregate report is what leaves that environment.
   */
  detail?: boolean;
  /** Identifiers per issue in detail mode. Bounded so one bad import cannot print a database. */
  detailLimit?: number;
};

const DEFAULT_DETAIL_LIMIT = 50;

/** Rows from a raw statement, whichever driver ran it. */
function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: unknown[] }).rows ?? []) as T[];
}

async function scalar(db: DbOrTx, statement: SQL): Promise<number> {
  const rows = resultRows<{ value: number | string | null }>(await db.execute(statement));
  return Number(rows[0]?.value ?? 0);
}

/** `and user_id = …` for an owner-scoped audit, or nothing at all. */
function owner(userId: string | undefined, column: SQL): SQL {
  return userId ? sql` and ${column} = ${userId}` : sql``;
}

async function countOf(
  db: DbOrTx,
  table: SQL,
  userId?: string,
  column = "user_id",
): Promise<number> {
  return scalar(
    db,
    sql`select count(*)::int as value from ${table} where true${owner(userId, sql.raw(column))}`,
  );
}

type IssueQuery = {
  category: string;
  blocking: boolean;
  description: string;
  /** Selects `user_id`, `source`, `id` and optionally `related_id` for each offending row. */
  rows: (userId: string | undefined) => SQL;
};

/**
 * Every condition the migration policy has a rule for. The order is the order of the report,
 * which puts identity and ownership before value ranges: a cross-owner link is a correction,
 * an out-of-range legacy value is preserved as it stands (§10.2).
 */
const ISSUE_QUERIES: readonly IssueQuery[] = [
  {
    category: "planned_run_duplicates",
    blocking: true,
    description:
      "Several raw runs point at one planned run. Only an authoritative completion event may resolve which one fulfilled it (§10.3).",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, min(r.id::text) as id, r.program_run_id::text as related_id
      from public.runs r
      where r.program_run_id is not null${owner(userId, sql.raw("r.user_id"))}
      group by r.user_id, r.program_run_id
      having count(*) > 1`,
  },
  {
    category: "slot_event_orphan_run",
    blocking: true,
    description:
      "A completion event names a run that no longer exists. The event cannot invent an activity, so the mapping is held.",
    rows: (userId) => sql`
      select e.user_id, 'program_slot_events' as source, e.id::text as id, e.run_id::text as related_id
      from public.program_slot_events e
      where e.run_id is not null
        and not exists (select 1 from public.runs r where r.id = e.run_id)
        ${owner(userId, sql.raw("e.user_id"))}`,
  },
  {
    category: "slot_event_orphan_session",
    blocking: true,
    description:
      "A completion event names a workout session that no longer exists; its resolution cannot be derived.",
    rows: (userId) => sql`
      select e.user_id, 'program_slot_events' as source, e.id::text as id, e.workout_session_id::text as related_id
      from public.program_slot_events e
      where e.workout_session_id is not null
        and not exists (select 1 from public.workout_sessions s where s.id = e.workout_session_id)
        ${owner(userId, sql.raw("e.user_id"))}`,
  },
  {
    category: "cross_owner_run_planned",
    blocking: true,
    description:
      "A run links to another account's planned run. The raw record is kept; the link is isolated for correction, never reassigned.",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, r.id::text as id, r.program_run_id::text as related_id
      from public.runs r
      join public.program_runs pr on pr.id = r.program_run_id
      where pr.user_id <> r.user_id${owner(userId, sql.raw("r.user_id"))}`,
  },
  {
    category: "cross_owner_run_session",
    blocking: true,
    description: "A run links to another account's workout session.",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, r.id::text as id, r.workout_session_id::text as related_id
      from public.runs r
      join public.workout_sessions s on s.id = r.workout_session_id
      where s.user_id <> r.user_id${owner(userId, sql.raw("r.user_id"))}`,
  },
  {
    category: "cross_owner_slot_event_run",
    blocking: true,
    description: "A completion event names another account's run.",
    rows: (userId) => sql`
      select e.user_id, 'program_slot_events' as source, e.id::text as id, e.run_id::text as related_id
      from public.program_slot_events e
      join public.runs r on r.id = e.run_id
      where r.user_id <> e.user_id${owner(userId, sql.raw("e.user_id"))}`,
  },
  {
    category: "cross_owner_slot_event_session",
    blocking: true,
    description: "A completion event names another account's workout session.",
    rows: (userId) => sql`
      select e.user_id, 'program_slot_events' as source, e.id::text as id, e.workout_session_id::text as related_id
      from public.program_slot_events e
      join public.workout_sessions s on s.id = e.workout_session_id
      where s.user_id <> e.user_id${owner(userId, sql.raw("e.user_id"))}`,
  },
  {
    category: "shared_stat_missing_source",
    blocking: true,
    description:
      "A shared row has no owned source record. The same-owner source constraint (M2) cannot be validated until each is reconciled.",
    rows: (userId) => sql`
      select s.user_id, 'shared_session_stats' as source, s.id::text as id, s.source_id::text as related_id
      from public.shared_session_stats s
      where not exists (
        select 1 from public.activities a
        where a.id = coalesce(s.activity_id, s.source_id) and a.user_id = s.user_id
          and a.sport::text = case s.sport::text
            when 'run' then 'running' when 'workout' then 'strength'
            when 'cycle' then 'cycling' when 'swim' then 'swimming' end)
        and ((s.sport = 'run'
              and not exists (select 1 from public.runs r where r.id = s.source_id and r.user_id = s.user_id))
         or (s.sport = 'workout'
              and not exists (select 1 from public.workout_sessions w
                              where w.id = s.source_id and w.user_id = s.user_id))
         or s.sport in ('cycle', 'swim'))
        ${owner(userId, sql.raw("s.user_id"))}`,
  },
  {
    category: "id_collision_run_session",
    blocking: false,
    description:
      "One UUID is both a run and a workout session. The run keeps its id, the session's parent is minted, and the ledger records both — the deterministic mapping in §10.3, not a decision anybody has to make.",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, r.id::text as id, s.id::text as related_id
      from public.runs r
      join public.workout_sessions s on s.id = r.id
      where true${owner(userId, sql.raw("r.user_id"))}`,
  },
  {
    category: "legacy_completion_without_run",
    blocking: false,
    description:
      "A run part was completed with no raw run (migration 0011 among them). Mapped to an explicit legacy-completed resolution with its provenance; no activity is fabricated.",
    rows: (userId) => sql`
      select e.user_id, 'program_slot_events' as source, e.id::text as id, null as related_id
      from public.program_slot_events e
      where e.part = 'run' and e.status = 'completed' and e.run_id is null
        ${owner(userId, sql.raw("e.user_id"))}`,
  },
  {
    category: "legacy_unconfirmed_effort",
    blocking: false,
    description:
      "A run holds a numeric RPE that was never confirmed as reported. It stays legacy_unconfirmed and is never promoted (LOG-03).",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, r.id::text as id, null as related_id
      from public.runs r
      where r.rpe is not null and r.effort_reported = false${owner(userId, sql.raw("r.user_id"))}`,
  },
  {
    category: "run_zero_distance",
    blocking: false,
    description:
      "A run recorded no distance. Preserved unchanged and excluded from pace, which was already undefined for it.",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, r.id::text as id, null as related_id
      from public.runs r
      where r.distance_meters = 0${owner(userId, sql.raw("r.user_id"))}`,
  },
  {
    category: "run_outside_new_bounds",
    blocking: false,
    description:
      "A legacy run lies outside the new input bounds (1,000 km or seven days). Preserved with migration provenance; a notes-only edit does not normalise it (§4.6).",
    rows: (userId) => sql`
      select r.user_id, 'runs' as source, r.id::text as id, null as related_id
      from public.runs r
      where r.distance_meters > 1000000 or r.duration_seconds > 604800
        ${owner(userId, sql.raw("r.user_id"))}`,
  },
  {
    category: "planned_run_without_program_day",
    blocking: false,
    description:
      "A planned run falls on a weekday the programme has no day slot for. Its occurrence keeps the recorded week and weekday; no strength position is invented.",
    rows: (userId) => sql`
      select pr.user_id, 'program_runs' as source, pr.id::text as id, pr.program_id::text as related_id
      from public.program_runs pr
      where not exists (
        select 1 from public.program_days d
        where d.program_id = pr.program_id and d.day_of_week = pr.day_of_week)
        ${owner(userId, sql.raw("pr.user_id"))}`,
  },
  {
    category: "unconfirmed_time_zone",
    blocking: false,
    description:
      "The account still carries the default UTC zone, so historical local dates are inferred at migration rather than known at performance (TIME-01).",
    rows: (userId) => sql`
      select p.id as user_id, 'profiles' as source, p.id::text as id, null as related_id
      from public.profiles p
      where p.time_zone = 'UTC'${owner(userId, sql.raw("p.id"))}`,
  },
  {
    category: "session_plan_run_payload",
    blocking: false,
    description:
      "A stored coach preparation carries a run payload that becomes an occurrence-scoped preparation; its original blob and version are retained.",
    rows: (userId) => sql`
      select sp.user_id, 'session_plans' as source, sp.id::text as id, null as related_id
      from public.session_plans sp
      where sp.run is not null${owner(userId, sql.raw("sp.user_id"))}`,
  },
  {
    category: "unknown_blueprint_payload",
    blocking: true,
    description:
      "A stored programme draft has neither a recognised v1 shape nor a declared version. It is retained and read by hand, not guessed at.",
    rows: (userId) => sql`
      select d.user_id, 'program_drafts' as source, d.id::text as id, null as related_id
      from public.program_drafts d
      where not (d.blueprint ? 'days') and not (d.blueprint ? 'blueprintVersion')
        ${owner(userId, sql.raw("d.user_id"))}`,
  },
];

export async function auditMultisport(
  db: DbOrTx,
  options: AuditOptions = {},
): Promise<MultisportAudit> {
  const { userId, detail = false, detailLimit = DEFAULT_DETAIL_LIMIT } = options;
  const counts: AuditCounts = {
    profiles: await countOf(db, sql.raw("public.profiles"), userId, "id"),
    runs: await countOf(db, sql.raw("public.runs"), userId),
    workoutSessions: await countOf(db, sql.raw("public.workout_sessions"), userId),
    programs: await countOf(db, sql.raw("public.programs"), userId),
    activePrograms: await scalar(
      db,
      sql`select count(*)::int as value from public.programs
          where status = 'active'${owner(userId, sql.raw("user_id"))}`,
    ),
    programDays: await countOf(db, sql.raw("public.program_days"), userId),
    programRuns: await countOf(db, sql.raw("public.program_runs"), userId),
    programSlotEvents: await countOf(db, sql.raw("public.program_slot_events"), userId),
    sessionPlans: await countOf(db, sql.raw("public.session_plans"), userId),
    sharedSessionStats: await countOf(db, sql.raw("public.shared_session_stats"), userId),
    dailyRecovery: await countOf(db, sql.raw("public.daily_recovery"), userId),
    savedRoutines: await countOf(db, sql.raw("public.saved_routines"), userId),
    programDrafts: await countOf(db, sql.raw("public.program_drafts"), userId),
    coachJobs: await countOf(db, sql.raw("public.coach_jobs"), userId),
  };

  const issues: AuditIssue[] = [];
  for (const query of ISSUE_QUERIES) {
    const rows = query.rows(userId);
    const count = await scalar(db, sql`select count(*)::int as value from (${rows}) as offending`);
    if (count === 0) continue;
    const issue: AuditIssue = {
      category: query.category,
      count,
      blocking: query.blocking,
      description: query.description,
    };
    if (detail) {
      const detailRows = resultRows<{
        user_id: string;
        source: string;
        id: string;
        related_id: string | null;
      }>(await db.execute(sql`select * from (${rows}) as offending limit ${detailLimit}`));
      issue.references = detailRows.map((row) => ({
        userId: row.user_id,
        source: row.source,
        id: row.id,
        ...(row.related_id ? { relatedId: row.related_id } : {}),
      }));
    }
    issues.push(issue);
  }

  const loggedResolutions = await scalar(
    db,
    sql`select count(*)::int as value from public.program_slot_events e
        where e.part = 'run' and e.status = 'completed' and e.run_id is not null
          ${owner(userId, sql.raw("e.user_id"))}`,
  );
  const legacyCompletedResolutions =
    issues.find((issue) => issue.category === "legacy_completion_without_run")?.count ?? 0;

  return {
    auditVersion: MULTISPORT_AUDIT_VERSION,
    generatedAt: new Date().toISOString(),
    userId: userId ?? null,
    counts,
    projection: {
      activities: counts.runs + counts.workoutSessions,
      enduranceOccurrences: counts.programRuns,
      loggedResolutions,
      legacyCompletedResolutions,
    },
    issues,
    blocked: issues.some((issue) => issue.blocking),
  };
}

/** The aggregate report. Safe to copy out of the operator's environment: no athlete data. */
export function formatAudit(audit: MultisportAudit): string {
  const lines = [
    `Multisport audit v${audit.auditVersion} — ${audit.generatedAt}`,
    `Scope: ${audit.userId ? `one account (${audit.userId})` : "all accounts"}`,
    "",
    "Counts",
    ...Object.entries(audit.counts).map(([name, value]) => `  ${name}: ${value}`),
    "",
    "Backfill projection",
    ...Object.entries(audit.projection).map(([name, value]) => `  ${name}: ${value}`),
    "",
    audit.issues.length === 0 ? "No issues found." : "Issues",
    ...audit.issues.map(
      (issue) =>
        `  [${issue.blocking ? "BLOCKING" : "note"}] ${issue.category}: ${issue.count}\n` +
        `      ${issue.description}`,
    ),
    "",
    audit.blocked
      ? "Result: BLOCKED. Resolve the blocking issues; the backfill holds these accounts back."
      : "Result: no blocking issues. The backfill runs itself as part of db:deploy.",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  try {
    console.log(`Auditing → ${describeTarget(url)}`);
    const audit = await auditMultisport(drizzle(client, { schema }));
    console.log(formatAudit(audit));
    if (audit.blocked) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing the functions above must touch nothing.
if (process.argv[1]?.endsWith("multisport-audit.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
