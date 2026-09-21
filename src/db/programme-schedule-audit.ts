import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { getMigrationDatabaseUrl } from "../lib/env";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import type { DbOrTx } from "./types";

/**
 * Where each programme's endurance work sits in its cycle, and where it does not sit anywhere.
 *
 * Read-only, and deliberately narrow: every statement is a `select`, and what comes back is
 * structure — day indexes, weekdays, cycle positions, dispositions and counts. No athlete's
 * measurements, notes, loads or symptoms are read, so the report can be pasted into a bug
 * thread as it stands.
 *
 * It answers the question migration 0032 exists for. An occurrence used to be joined to a day
 * of the cycle by the weekday it falls on, which is not an identity: a lifting day may share a
 * weekday with a running day, a cycle longer than a week has to repeat them, and a revision
 * that moved a run left the old work behind. Any of those put a run on a day that asks for
 * none. The rows below say, per programme, whether that has happened and to what.
 */

/** Rows from a raw statement, whichever driver ran it (the audit's own helper, same rule). */
function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: unknown[] }).rows ?? []) as T[];
}

export type DayRow = {
  dayIndex: number;
  dayOfWeek: number | null;
  name: string;
  includesLifting: boolean;
  includesRun: boolean;
  /** Planned runs the legacy table holds for this day's weekday, across all weeks. */
  legacyRunRows: number;
};

export type SlotRow = {
  cycleDayIndex: number | null;
  sport: string;
  disposition: string;
  answered: number;
  pending: number;
  earliest: string | null;
  latest: string | null;
  /** Pending, unanswered and dated before today: work the sequence can still hand out. */
  overdue: number;
};

export type ProgrammeAudit = {
  programId: string;
  familyId: string;
  name: string;
  status: string;
  version: number;
  weeks: number;
  startDate: string | null;
  days: DayRow[];
  slots: SlotRow[];
  findings: string[];
};

export type ScheduleAudit = {
  today: string;
  programmes: ProgrammeAudit[];
  /** Occurrences whose family has no programme row left at all. */
  orphanedFamilies: number;
};

/**
 * The audit for one account, or for every account when `userId` is omitted.
 *
 * Scoped by user because that is how a report arrives — one athlete, one screenshot — and
 * unscoped when somebody wants to know how widespread a shape is before changing it.
 */
export async function auditProgrammeSchedules(
  db: DbOrTx,
  options: { userId?: string } = {},
): Promise<ScheduleAudit> {
  const user = options.userId ?? null;
  const today = resultRows<{ today: string }>(
    await db.execute(sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD') as today`),
  )[0]!.today;

  const programmes = resultRows<{
    programId: string;
    familyId: string;
    name: string;
    status: string;
    version: number;
    weeks: number | null;
    startDate: string | null;
  }>(
    await db.execute(sql`
    select g.id as "programId", g.family_id as "familyId", g.name, g.status, g.version,
           g.weeks, g.start_date::text as "startDate"
    from programs g
    where g.status <> 'archived'
      and (${user}::uuid is null or g.user_id = ${user}::uuid)
    order by g.user_id, g.version desc
  `),
  );

  const out: ProgrammeAudit[] = [];
  for (const programme of programmes) {
    const days = resultRows<DayRow>(
      await db.execute(sql`
      select d.day_index as "dayIndex", d.day_of_week as "dayOfWeek", d.name,
             d.includes_lifting as "includesLifting", d.includes_run as "includesRun",
             (select count(*)::int from program_runs r
               where r.program_id = d.program_id and r.day_of_week = d.day_of_week)
               as "legacyRunRows"
      from program_days d
      where d.program_id = ${programme.programId}
      order by d.day_index
    `),
    );

    const slots = resultRows<SlotRow>(
      await db.execute(sql`
      select o.cycle_day_index as "cycleDayIndex", o.sport, o.disposition,
             count(*) filter (where a.id is not null or o.disposition <> 'pending')::int
               as "answered",
             count(*) filter (where a.id is null and o.disposition = 'pending')::int as "pending",
             min(v.scheduled_on)::text as "earliest",
             max(v.scheduled_on)::text as "latest",
             count(*) filter (
               where a.id is null and o.disposition = 'pending' and v.scheduled_on < current_date
             )::int as "overdue"
      from planned_occurrences o
      left join occurrence_versions v on v.id = o.current_revision_id and v.user_id = o.user_id
      left join activities a on a.occurrence_id = o.id and a.user_id = o.user_id
      where o.family_id = ${programme.familyId}
      group by o.cycle_day_index, o.sport, o.disposition
      order by o.cycle_day_index nulls last, o.sport
    `),
    );

    out.push({
      ...programme,
      weeks: programme.weeks ?? 8,
      days,
      slots,
      findings: findingsFor(days, slots),
    });
  }

  const [orphans] = resultRows<{ orphaned: number }>(
    await db.execute(sql`
    select count(*)::int as orphaned
    from planned_occurrences o
    where o.family_id is not null
      and (${user}::uuid is null or o.user_id = ${user}::uuid)
      and not exists (select 1 from programs g where g.family_id = o.family_id)
  `),
  );

  return { today, programmes: out, orphanedFamilies: orphans?.orphaned ?? 0 };
}

/**
 * What about this programme would have put a run on a day that asks for none.
 *
 * Only what is actually wrong. Work that is open and dated before today is ordinary for an
 * athlete who is behind their programme — the sequence shifts and the dates do not — so the
 * counts are printed beside each slot and nothing is claimed about them.
 */
function findingsFor(days: readonly DayRow[], slots: readonly SlotRow[]): string[] {
  const findings: string[] = [];
  const byWeekday = new Map<number, DayRow[]>();
  for (const day of days) {
    if (day.dayOfWeek === null) {
      findings.push(`Day ${day.dayIndex} (${day.name}) has no weekday.`);
      continue;
    }
    byWeekday.set(day.dayOfWeek, [...(byWeekday.get(day.dayOfWeek) ?? []), day]);
  }
  for (const [dayOfWeek, sharing] of byWeekday) {
    if (sharing.length < 2) continue;
    const runners = sharing.filter((day) => day.includesRun);
    const names = sharing.map((day) => `${day.dayIndex} ${day.name}`).join(", ");
    if (runners.length > 1)
      findings.push(
        `Weekday ${dayOfWeek} carries two running days (${names}); a planned run cannot say which it belongs to.`,
      );
    else if (runners.length === 1)
      findings.push(
        `Weekday ${dayOfWeek} is shared by a running day and a day that does not run (${names}). This is the shape that offered the run on the wrong day before migration 0032.`,
      );
  }
  for (const day of days)
    if (day.includesRun && day.legacyRunRows === 0)
      findings.push(`Day ${day.dayIndex} (${day.name}) runs but has no planned run rows.`);

  const runDays = new Set(days.filter((day) => day.includesRun).map((day) => day.dayIndex));
  for (const slot of slots) {
    if (slot.cycleDayIndex === null) {
      const owed = slot.pending;
      findings.push(
        `${slot.pending + slot.answered} ${slot.sport} occurrence(s) belong to no slot of the cycle` +
          (owed > 0
            ? `, ${owed} of them still open. No day offers these; a revision withdraws them.`
            : "."),
      );
      continue;
    }
    if (!runDays.has(slot.cycleDayIndex))
      findings.push(
        `Day ${slot.cycleDayIndex} holds ${slot.sport} work but the current cycle says it does not run.`,
      );
  }
  return findings;
}

export function formatAudit(audit: ScheduleAudit): string {
  const lines: string[] = [`Programme schedule audit — ${audit.today}`, ""];
  if (audit.programmes.length === 0) lines.push("No active or draft programme.");
  for (const programme of audit.programmes) {
    lines.push(
      `${programme.name} (${programme.status} v${programme.version}, ${programme.weeks} weeks, from ${programme.startDate ?? "no start date"})`,
      `  family ${programme.familyId}`,
      "  days:",
      ...programme.days.map(
        (day) =>
          `    ${String(day.dayIndex).padStart(2)}  weekday ${day.dayOfWeek ?? "—"}  ` +
          `${day.includesLifting ? "lift" : "    "} ${day.includesRun ? "run" : "   "}  ` +
          `${day.legacyRunRows} planned run row(s)  ${day.name}`,
      ),
      "  endurance occurrences by slot:",
      ...(programme.slots.length === 0
        ? ["    none"]
        : programme.slots.map(
            (slot) =>
              `    day ${slot.cycleDayIndex ?? "—"}  ${slot.sport}  ${slot.disposition}  ` +
              `${slot.answered} answered, ${slot.pending} open (${slot.overdue} overdue)  ` +
              `${slot.earliest ?? "?"} → ${slot.latest ?? "?"}`,
          )),
      programme.findings.length === 0
        ? "  findings: none"
        : `  findings:\n${programme.findings.map((finding) => `    - ${finding}`).join("\n")}`,
      "",
    );
  }
  if (audit.orphanedFamilies > 0)
    lines.push(`${audit.orphanedFamilies} occurrence(s) name a family with no programme row.`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const userFlag = process.argv.indexOf("--user");
  const userId = userFlag === -1 ? undefined : process.argv[userFlag + 1];
  const client = createMigrationClient(url);
  try {
    console.log(
      `Auditing → ${describeTarget(url)}${userId ? ` (user ${userId})` : " (all users)"}`,
    );
    console.log(
      formatAudit(await auditProgrammeSchedules(drizzle(client, { schema }), { userId })),
    );
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing the functions above must touch nothing.
if (process.argv[1]?.endsWith("programme-schedule-audit.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
