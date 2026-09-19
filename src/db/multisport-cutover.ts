import { sql } from "drizzle-orm";

import { activities } from "./schema";
import type { DbOrTx } from "./types";

/**
 * The markers that make the cutover's order checkable after the fact (plan §10.4 steps 5–8).
 *
 * The rollout order is only worth having if somebody can tell, later, which side of it a row
 * fell on. Three facts settle that: when writes were paused, when authority moved, and which
 * activity was the first one the canonical writer produced. Each is a named row in the
 * existing `data_backfills` ledger — a table that already exists for exactly this kind of
 * "this happened once" fact, which is better than a new one nobody thinks to read.
 *
 * Nothing here is authorisation. Recording that the switch was thrown does not throw it; the
 * capability gate does that, and this says when.
 */

export const CUTOVER_MARKERS = {
  /** Dispatch paused and leases drained; the short write pause has begun (§10.4 step 5). */
  writePauseStarted: "multisport_write_pause_started",
  /** M2 validated and authority moved. Everything after this is canonical (§10.4 step 7). */
  authoritySwitched: "multisport_authority_switched",
  /** The first activity the canonical writer produced, for the rollback boundary (§10.6). */
  firstCanonicalWrite: "multisport_first_canonical_write",
} as const;

export type CutoverMarker = (typeof CUTOVER_MARKERS)[keyof typeof CUTOVER_MARKERS];

export type MarkerRecord = { name: string; ranAt: string };

async function rows(db: DbOrTx, statement: ReturnType<typeof sql>) {
  const result = await db.execute(statement);
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as {
    name: string;
    completed_at: string | Date;
  }[];
}

/** Records a marker once. A second call is a no-op: the first time is the fact. */
export async function recordMarker(db: DbOrTx, name: CutoverMarker): Promise<void> {
  await db.execute(
    sql`insert into public.data_backfills (name) values (${name}) on conflict (name) do nothing`,
  );
}

export async function readMarkers(db: DbOrTx): Promise<MarkerRecord[]> {
  const found = await rows(
    db,
    sql`select name, completed_at from public.data_backfills
        where name like 'multisport_%' order by completed_at`,
  );
  return found.map((row) => ({
    name: row.name,
    ranAt:
      row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at),
  }));
}

export async function markerAt(db: DbOrTx, name: CutoverMarker): Promise<string | null> {
  const markers = await readMarkers(db);
  return markers.find((marker) => marker.name === name)?.ranAt ?? null;
}

export type CutoverAssertion = { name: string; ok: boolean; detail: string };

/**
 * The two assertions §10.4 names by name, checked against the rows rather than assumed.
 *
 * "No new sport writes before the switch" and "no legacy writes after it" are the invariants
 * that make the order mean anything. Both are decidable from the data: a cycling or swimming
 * activity is a new-sport write, a `runs` row is a legacy one, and the switch has a
 * timestamp. Checking them is how an abort stays possible — before the switch there is
 * nothing canonical-only to lose, and that claim is either true of this database or it is not.
 */
export async function cutoverAssertions(db: DbOrTx): Promise<CutoverAssertion[]> {
  const switchedAt = await markerAt(db, CUTOVER_MARKERS.authoritySwitched);
  const assertions: CutoverAssertion[] = [];

  const [early] = await rows(
    db,
    switchedAt === null
      ? sql`select 'x' as name, count(*)::text as completed_at from ${activities}
            where sport in ('cycling', 'swimming')`
      : sql`select 'x' as name, count(*)::text as completed_at from ${activities}
            where sport in ('cycling', 'swimming') and created_at < ${switchedAt}::timestamptz`,
  );
  const earlyCount = Number(early?.completed_at ?? 0);
  assertions.push({
    name: "no new-sport activity exists from before the switch",
    ok: earlyCount === 0,
    detail:
      earlyCount === 0
        ? switchedAt === null
          ? "Authority has not switched, and no ride or swim has been written."
          : `Every ride and swim was written after ${switchedAt}.`
        : `${earlyCount} rides or swims predate the switch. The legacy model cannot represent them, so an abort would lose them.`,
  });

  if (switchedAt !== null) {
    const [late] = await rows(
      db,
      sql`select 'x' as name, count(*)::text as completed_at from public.runs
          where created_at > ${switchedAt}::timestamptz`,
    );
    const lateCount = Number(late?.completed_at ?? 0);
    assertions.push({
      name: "no legacy run was written after the switch",
      ok: lateCount === 0,
      detail:
        lateCount === 0
          ? "The legacy writer stopped when authority moved."
          : `${lateCount} runs were written to the legacy table after ${switchedAt}. Two writers are live; stop one before going further.`,
    });
  }

  return assertions;
}

/**
 * Whether the cutover can still be aborted with a switch rather than a replay (§10.6).
 *
 * True only while nothing canonical-only exists. After the first canonical write the honest
 * answer is no: an earlier release cannot represent an occurrence or a swim, and pretending
 * a flag would undo it is how data gets discarded to boot an old application.
 */
export async function abortIsStillSafe(db: DbOrTx): Promise<{ safe: boolean; reason: string }> {
  const switchedAt = await markerAt(db, CUTOVER_MARKERS.authoritySwitched);
  if (switchedAt !== null)
    return {
      safe: false,
      reason: `Authority switched at ${switchedAt}. Returning to the bridge is a rehearsed replay, not a flag change (§10.6).`,
    };
  const assertions = await cutoverAssertions(db);
  const failed = assertions.find((assertion) => !assertion.ok);
  if (failed) return { safe: false, reason: failed.detail };
  return {
    safe: true,
    reason:
      "Legacy is still authoritative and nothing canonical-only exists. The additive tables can be kept for investigation.",
  };
}
