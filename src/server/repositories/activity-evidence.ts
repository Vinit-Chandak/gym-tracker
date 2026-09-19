import { and, eq, inArray } from "drizzle-orm";

import { activities, multisportMigrationLinks, plannedOccurrences } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import {
  activityEvidenceId,
  parseEvidenceId,
  type ActivitySport,
  type EvidenceRef,
} from "@/domain/activity";
import type { AthleteSource } from "@/domain/coach-memory";

/**
 * What a coach's evidence identifier points at, once activities exist (plan §8.4, COACH-09).
 *
 * A report written a year ago says `run:<uuid>`. That run is now an activity, and it may even
 * have kept the same UUID — but it may not, because a collision with a workout session forced
 * one of the two to be minted afresh. Either way the report still means the session it meant,
 * so the old string is resolved through the migration ledger rather than rewritten. Nothing
 * rewrites history to make a new model look tidy (MIG-02).
 *
 * `run:wednesday` is a different animal entirely. It was never an activity: it named a slot,
 * and once two runs can share a Wednesday it cannot name a session at all. It resolves to a
 * scope, not a record, and the distinction is kept because collapsing the two would let a
 * guardrail cite "the Wednesday run" as though it were a measurement (§8.4).
 */

export type ResolvedEvidence =
  | { kind: "activity"; id: string; sport: ActivitySport }
  /** A legacy `run:<weekday>` guardrail scope; occurrences, not one record. */
  | { kind: "scope"; weekday: string; occurrenceIds: string[] }
  | { kind: "unresolved"; raw: string };

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** The canonical id a legacy source maps to, from the ledger the backfill wrote. */
export async function canonicalActivityIds(
  tx: DbOrTx,
  userId: string,
  sources: readonly { kind: string; id: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (sources.length === 0) return out;
  const rows = await tx
    .select({
      sourceKind: multisportMigrationLinks.sourceKind,
      sourceId: multisportMigrationLinks.sourceId,
      targetId: multisportMigrationLinks.targetId,
      targetKind: multisportMigrationLinks.targetKind,
    })
    .from(multisportMigrationLinks)
    .where(
      and(
        eq(multisportMigrationLinks.userId, userId),
        inArray(
          multisportMigrationLinks.sourceId,
          sources.map((source) => source.id),
        ),
      ),
    );
  for (const row of rows) {
    if (row.targetKind !== "activities") continue;
    if (!sources.some((source) => source.kind === row.sourceKind && source.id === row.sourceId))
      continue;
    out.set(`${row.sourceKind}:${row.sourceId}`, row.targetId);
  }
  return out;
}

/**
 * Resolves a batch of evidence identifiers to what they actually name.
 *
 * Owner-checked throughout: an identifier naming another athlete's record resolves to nothing
 * rather than to their data, because the map is read inside the owner's scope and the rows
 * are joined on the owner's id (AT-DATA-05).
 */
export async function resolveEvidenceIds(
  tx: DbOrTx,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, ResolvedEvidence>> {
  const out = new Map<string, ResolvedEvidence>();
  const refs = ids.map((raw) => [raw, parseEvidenceId(raw)] as const);
  const direct = refs.flatMap(([, ref]) => (ref.kind === "activity" ? [ref.id] : []));
  const legacyRuns = refs.flatMap(([, ref]) => (ref.kind === "legacy_run" ? [ref.id] : []));

  const mapped = await canonicalActivityIds(
    tx,
    userId,
    legacyRuns.map((id) => ({ kind: "runs", id })),
  );
  // A run whose id survived the migration unchanged has no ledger row saying "it is itself",
  // so the direct lookup below covers it. One that was re-minted does, and that is the row.
  const candidates = [...new Set([...direct, ...legacyRuns, ...mapped.values()])];
  const rows = candidates.length
    ? await tx
        .select({ id: activities.id, sport: activities.sport })
        .from(activities)
        .where(and(eq(activities.userId, userId), inArray(activities.id, candidates)))
    : [];
  const sportById = new Map(rows.map((row) => [row.id, row.sport]));

  const weekdays = refs.flatMap(([, ref]) =>
    ref.kind === "legacy_run_weekday" ? [ref.weekday.toLowerCase()] : [],
  );
  const scopeOccurrences = new Map<string, string[]>();
  if (weekdays.length > 0) {
    const running = await tx
      .select({
        id: plannedOccurrences.id,
        originalScheduledOn: plannedOccurrences.originalScheduledOn,
      })
      .from(plannedOccurrences)
      .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.sport, "running")));
    for (const weekday of new Set(weekdays)) {
      const index = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
      scopeOccurrences.set(
        weekday,
        index < 0
          ? []
          : running
              .filter((row) => {
                if (!row.originalScheduledOn) return false;
                const [year, month, day] = row.originalScheduledOn.split("-").map(Number);
                return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() === index;
              })
              .map((row) => row.id),
      );
    }
  }

  for (const [raw, ref] of refs) {
    out.set(raw, resolveOne(raw, ref, sportById, mapped, scopeOccurrences));
  }
  return out;
}

function resolveOne(
  raw: string,
  ref: EvidenceRef,
  sportById: Map<string, ActivitySport>,
  mapped: Map<string, string>,
  scopes: Map<string, string[]>,
): ResolvedEvidence {
  if (ref.kind === "activity") {
    const sport = sportById.get(ref.id);
    return sport ? { kind: "activity", id: ref.id, sport } : { kind: "unresolved", raw };
  }
  if (ref.kind === "legacy_run") {
    const id = mapped.get(`runs:${ref.id}`) ?? ref.id;
    const sport = sportById.get(id);
    return sport ? { kind: "activity", id, sport } : { kind: "unresolved", raw };
  }
  if (ref.kind === "legacy_run_weekday") {
    const weekday = ref.weekday.toLowerCase();
    const occurrenceIds = scopes.get(weekday);
    return occurrenceIds === undefined || occurrenceIds.length === 0
      ? { kind: "unresolved", raw }
      : { kind: "scope", weekday, occurrenceIds };
  }
  return { kind: "unresolved", raw };
}

/** The evidence identifiers of a set of activities, in the form a report should cite. */
export function evidenceIdsFor(activityIds: readonly string[]): string[] {
  return activityIds.map(activityEvidenceId);
}

/**
 * Notes an athlete wrote on their own activities, as quotable sources.
 *
 * Extends the existing note/quote rules to cycling and swimming under the same conditions:
 * the account owns it, the text is theirs, and the quote must appear in the text as it stands
 * now. An edited note is a new revision and a new opportunity to quote; an old quotation does
 * not silently re-attach to changed words (§8.4).
 */
export async function activityNoteSources(
  tx: DbOrTx,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, AthleteSource & { sport: ActivitySport; revision: number }>> {
  const sources = new Map<string, AthleteSource & { sport: ActivitySport; revision: number }>();
  const activityIds = ids.flatMap((id) => {
    const ref = parseEvidenceId(id);
    return ref.kind === "activity" ? [ref.id] : [];
  });
  if (activityIds.length === 0) return sources;
  const rows = await tx
    .select({
      id: activities.id,
      sport: activities.sport,
      notes: activities.notes,
      revision: activities.revision,
      startedAt: activities.startedAt,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), inArray(activities.id, activityIds)));
  for (const row of rows) {
    if (!row.notes?.trim()) continue;
    sources.set(activityEvidenceId(row.id), {
      text: row.notes,
      createdAt: row.startedAt.toISOString(),
      sport: row.sport,
      revision: row.revision,
    });
  }
  return sources;
}

/**
 * Evidence that no longer says what it said.
 *
 * A deleted activity, or one whose notes were edited after being quoted, cannot go on standing
 * as current evidence. The historical report keeps the quotation — that is what was written —
 * but the memo item resting on it is due a fresh look rather than an indefinite free pass
 * (§8.4).
 */
export async function staleEvidence(
  tx: DbOrTx,
  userId: string,
  quotes: readonly { sourceId: string; text: string }[],
): Promise<{ sourceId: string; reason: "removed" | "revised" }[]> {
  if (quotes.length === 0) return [];
  const sources = await activityNoteSources(
    tx,
    userId,
    quotes.map((quote) => quote.sourceId),
  );
  const stale: { sourceId: string; reason: "removed" | "revised" }[] = [];
  for (const quote of quotes) {
    if (!quote.sourceId.startsWith("activity:")) continue;
    const source = sources.get(quote.sourceId);
    if (!source) {
      stale.push({ sourceId: quote.sourceId, reason: "removed" });
      continue;
    }
    if (!source.text.includes(quote.text))
      stale.push({ sourceId: quote.sourceId, reason: "revised" });
  }
  return stale;
}
