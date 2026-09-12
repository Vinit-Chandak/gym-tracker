import type { LoadUnit, SetType } from "@/domain/types";
import { LOAD_UNITS, SET_TYPES } from "@/domain/types";
import { canConvertLoad, convertLoad } from "./units";

/** The numbers a set row can carry. Which of them the grid shows depends on the measure. */
export const DRAFT_VALUE_FIELDS = ["weight", "reps", "rir", "duration", "distance"] as const;

export type DraftValueField = (typeof DRAFT_VALUE_FIELDS)[number];

export type DraftFields = {
  unit?: LoadUnit;
  setIndex: number;
  setType: SetType;
  weight: string;
  reps: string;
  rir: string;
  duration: string;
  distance: string;
  /**
   * Which values the user actually set. An empty field that was never touched still takes
   * its row's suggestion when the set is saved; one the user deliberately cleared stays
   * unknown. Without this the two are the same empty string, and clearing an optional RIR
   * would silently restore the target it was cleared to reject.
   */
  touched?: DraftValueField[];
};
export type Draft = DraftFields & { baseCompletedAt: string | null };
export type DraftContext = {
  userId: string;
  sessionId: string;
  workoutExerciseId: string;
  exerciseId: string;
  equipmentId: string | null;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("overload:drafts"));
}
export function draftKey(ctx: DraftContext) {
  return `overload:draft:v1:${ctx.userId}:${ctx.sessionId}:${ctx.workoutExerciseId}:${ctx.exerciseId}:${ctx.equipmentId ?? "none"}`;
}

export function readDrafts(storage: StorageLike, ctx: DraftContext): Draft[] {
  try {
    const raw = storage.getItem(draftKey(ctx));
    if (!raw || raw.length > 50_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (row): row is Draft =>
          row &&
          Number.isInteger(row.setIndex) &&
          row.setIndex >= 1 &&
          row.setIndex <= 50 &&
          SET_TYPES.includes(row.setType) &&
          (row.unit === undefined || LOAD_UNITS.includes(row.unit)) &&
          [row.weight, row.reps, row.rir, row.duration, row.distance ?? ""].every(
            (v) => typeof v === "string" && v.length <= 24,
          ) &&
          (row.touched === undefined ||
            (Array.isArray(row.touched) &&
              row.touched.every((field: unknown) =>
                DRAFT_VALUE_FIELDS.includes(field as DraftValueField),
              ))) &&
          (row.baseCompletedAt === null || typeof row.baseCompletedAt === "string"),
      )
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** Only dirty rows are written. Confirmed saves remove their row; an empty draft removes the key. */
export function writeDraft(storage: StorageLike, ctx: DraftContext, row: Draft): boolean {
  try {
    const drafts = readDrafts(storage, ctx).filter((d) => d.setIndex !== row.setIndex);
    drafts.push(row);
    const payload = JSON.stringify(drafts);
    if (drafts.length > 50 || payload.length > 50_000) return false;
    storage.setItem(draftKey(ctx), payload);
    notify();
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(
  storage: StorageLike,
  ctx: DraftContext,
  setIndex: number,
  expected?: DraftFields,
): boolean {
  try {
    if (expected) {
      const current = readDrafts(storage, ctx).find((d) => d.setIndex === setIndex);
      if (
        current &&
        ["setType", "unit", "weight", "reps", "rir", "duration", "distance"].some(
          (field) => current[field as keyof DraftFields] !== expected[field as keyof DraftFields],
        )
      )
        return true;
    }
    const remaining = readDrafts(storage, ctx).filter((d) => d.setIndex !== setIndex);
    if (remaining.length) storage.setItem(draftKey(ctx), JSON.stringify(remaining));
    else storage.removeItem(draftKey(ctx));
    notify();
    return true;
  } catch {
    return false;
  }
}

/**
 * The fields a stored draft counts as set by the user. Drafts written before this was
 * recorded have no list, and are read the way they were written: whatever they hold is
 * what the user typed, and an empty field still falls back to its suggestion.
 */
export function touchedFields(draft: DraftFields): Set<DraftValueField> {
  if (draft.touched) return new Set(draft.touched);
  return new Set(DRAFT_VALUE_FIELDS.filter((field) => (draft[field] ?? "").trim() !== ""));
}

/** A lost response may have committed successfully. Clear that draft only after matching server values. */
export function draftMatchesSet(
  draft: DraftFields,
  set: {
    unit?: LoadUnit;
    setType: SetType;
    weight: number | null;
    reps: number | null;
    rir: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
  },
) {
  const numeric = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
  const weight = numeric(draft.weight);
  if (draft.unit && set.unit && !canConvertLoad(draft.unit, set.unit)) return false;
  return (
    draft.setType === set.setType &&
    (weight !== null && draft.unit && set.unit
      ? convertLoad(weight, draft.unit, set.unit)
      : weight) === set.weight &&
    numeric(draft.reps) === set.reps &&
    numeric(draft.rir) === set.rir &&
    numeric(draft.duration) === set.durationSeconds &&
    numeric(draft.distance) === set.distanceMeters
  );
}

export function countSessionDrafts(storage: Storage, userId: string, sessionId: string): number {
  let count = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(`overload:draft:v1:${userId}:${sessionId}:`)) {
        const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
        if (Array.isArray(value)) count += value.length;
      }
    }
  } catch {
    return count;
  }
  return count;
}
