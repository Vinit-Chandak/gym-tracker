import { enduranceIdentityWeek, type ProgrammeEnduranceSession } from "./programme-sport";

export type EnduranceSessionGroup = {
  id: string;
  indexes: number[];
  intervalDays: number | null;
  source: "series" | "lineage" | "matching";
  inferred: boolean;
};

/** Object key order is not meaningful in prescriptions read back from JSONB. */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Dates and identities identify performances; this is the work repeated by them. */
function signature(session: ProgrammeEnduranceSession): string {
  return stable({
    name: session.name,
    scheduledLocalTime: session.scheduledLocalTime,
    prescription: session.prescription,
  });
}

function interval(sessions: readonly ProgrammeEnduranceSession[], indexes: number[]) {
  const offsets = indexes.map((index) => sessions[index]!.dayOffset).sort((a, b) => a - b);
  if (offsets.length < 2) return null;
  const gap = offsets[1]! - offsets[0]!;
  return gap > 0 &&
    offsets.every((offset, index) => index === 0 || offset - offsets[index - 1]! === gap)
    ? gap
    : null;
}

/**
 * Show repeated work once, while retaining every dated prescription underneath it.
 * A progression is never collapsed into another target: even a known series is split at
 * prescription differences. Older coach plans with fresh identities per performance can be
 * recognized by exact content and a regular cadence, without rewriting their stored identity.
 */
export function enduranceSessionGroups(
  sessions: readonly ProgrammeEnduranceSession[],
): EnduranceSessionGroup[] {
  const candidates = new Map<string, number[]>();
  sessions.forEach((session, index) => {
    const key = `${session.seriesId ? `series:${session.seriesId}` : `lineage:${session.lineageId}`}:${signature(session)}`;
    const indexes = candidates.get(key) ?? [];
    indexes.push(index);
    candidates.set(key, indexes);
  });
  const groups: EnduranceSessionGroup[] = [];
  const unmatched = new Map<string, number[]>();
  for (const indexes of candidates.values()) {
    const first = sessions[indexes[0]!]!;
    if (indexes.length > 1 || first.seriesId) {
      const source = first.seriesId ? "series" : "lineage";
      groups.push({
        id: `${source}:${first.seriesId ?? first.lineageId}:${indexes[0]}`,
        indexes,
        intervalDays: interval(sessions, indexes),
        source,
        inferred: false,
      });
    } else {
      const key = signature(first);
      const matches = unmatched.get(key) ?? [];
      matches.push(indexes[0]!);
      unmatched.set(key, matches);
    }
  }
  for (const indexes of unmatched.values()) {
    const byWeekday = new Map<number, number[]>();
    for (const index of indexes) {
      const weekday = ((sessions[index]!.dayOffset % 7) + 7) % 7;
      const matches = byWeekday.get(weekday) ?? [];
      matches.push(index);
      byWeekday.set(weekday, matches);
    }
    // Two weekly roles can prescribe the same work (e.g. Monday and Thursday). Their
    // combined gaps alternate, but each weekday still has an exact weekly repetition.
    const parts = interval(sessions, indexes) === null ? [...byWeekday.values()] : [indexes];
    for (const part of parts) {
      // Two identical sessions on the same date are separate work, never a repeat.
      const gap = interval(sessions, part);
      if (gap !== null) {
        groups.push({
          id: `matching:${sessions[part[0]!]!.lineageId}:${part[0]}`,
          indexes: part,
          intervalDays: gap,
          source: "matching",
          inferred: true,
        });
        continue;
      }
      for (const index of part)
        groups.push({
          id: `session:${sessions[index]!.lineageId}:${index}`,
          indexes: [index],
          intervalDays: null,
          source: "lineage",
          inferred: false,
        });
    }
  }
  return groups.sort((a, b) => a.indexes[0]! - b.indexes[0]!);
}

export function moveEnduranceSession(
  session: ProgrammeEnduranceSession,
  dayOffset: number,
): ProgrammeEnduranceSession {
  const weekIndex = Math.max(1, Math.floor(dayOffset / 7) + 1);
  return {
    ...session,
    ...(weekIndex !== session.weekIndex
      ? { originalWeekIndex: enduranceIdentityWeek(session) }
      : {}),
    dayOffset,
    weekIndex,
  };
}

/**
 * Repeat from the selected date through the last included programme day. A four-day series
 * can occur twice in one week, so new performances receive their own lineage, not just a week.
 */
export function repeatEnduranceSession(
  session: ProgrammeEnduranceSession,
  options: {
    everyDays: number;
    throughDayOffset: number;
    seriesId?: string;
    createId?: () => string;
  },
): ProgrammeEnduranceSession[] {
  if (!Number.isInteger(options.everyDays) || options.everyDays < 1)
    throw new Error("Choose a repeat interval of at least one day.");
  if (
    !Number.isInteger(options.throughDayOffset) ||
    options.throughDayOffset > 363 ||
    session.dayOffset < 0 ||
    options.throughDayOffset < session.dayOffset
  )
    throw new Error("Keep repetitions within the 52-week programme.");
  const createId = options.createId ?? (() => crypto.randomUUID());
  const seriesId = options.seriesId ?? session.seriesId ?? createId();
  const result: ProgrammeEnduranceSession[] = [];
  for (
    let dayOffset = session.dayOffset;
    dayOffset <= options.throughDayOffset;
    dayOffset += options.everyDays
  )
    result.push({
      ...moveEnduranceSession(structuredClone(session), dayOffset),
      lineageId: result.length === 0 ? session.lineageId : createId(),
      // A generated performance has a new identity; it does not inherit the seed's old week.
      originalWeekIndex: result.length === 0 ? session.originalWeekIndex : undefined,
      seriesId,
    });
  return result;
}

/** Applies only properties actually changed, so untouched prescription detail survives. */
function changedPrescription(
  current: ProgrammeEnduranceSession["prescription"],
  original: ProgrammeEnduranceSession["prescription"],
  proposed: ProgrammeEnduranceSession["prescription"],
) {
  const result = { ...current };
  for (const key of Object.keys(proposed) as (keyof typeof proposed)[]) {
    if (key === "sessionTargets") {
      result.sessionTargets = { ...current.sessionTargets };
      for (const target of Object.keys(
        proposed.sessionTargets,
      ) as (keyof typeof proposed.sessionTargets)[])
        if (stable(original.sessionTargets[target]) !== stable(proposed.sessionTargets[target]))
          Object.assign(result.sessionTargets, { [target]: proposed.sessionTargets[target] });
    } else if (stable(original[key]) !== stable(proposed[key])) {
      // All fields come from a complete, typed prescription of this same sport.
      Object.assign(result, { [key]: proposed[key] });
    }
  }
  return result;
}

export function updateEnduranceSession(
  sessions: readonly ProgrammeEnduranceSession[],
  index: number,
  patch: Partial<ProgrammeEnduranceSession>,
  options: { scope: "this" | "future_repeats"; fromDayOffset?: number },
): ProgrammeEnduranceSession[] {
  const original = sessions[index];
  if (!original) return [...sessions];
  const group = enduranceSessionGroups(sessions).find((entry) => entry.indexes.includes(index));
  const boundary = Math.max(original.dayOffset, options.fromDayOffset ?? original.dayOffset);
  const matching = new Set(
    options.scope === "future_repeats" ? (group?.indexes ?? [index]) : [index],
  );
  return sessions.map((session, position) => {
    if (!matching.has(position) || session.dayOffset < boundary) return session;
    // Dates, occurrence identity and series membership are never bulk overwritten.
    const next = {
      ...session,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.scheduledLocalTime !== undefined
        ? { scheduledLocalTime: patch.scheduledLocalTime }
        : {}),
      ...(patch.prescription
        ? {
            prescription: changedPrescription(
              session.prescription,
              original.prescription,
              patch.prescription,
            ),
          }
        : {}),
    };
    return position === index && patch.dayOffset !== undefined
      ? moveEnduranceSession(next, patch.dayOffset)
      : next;
  });
}
