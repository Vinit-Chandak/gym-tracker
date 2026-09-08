import type { SetType } from "@/domain/types";
import { SET_TYPES } from "@/domain/types";

export type DraftFields = {
  setIndex: number;
  setType: SetType;
  weight: string;
  reps: string;
  rir: string;
  duration: string;
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
          [row.weight, row.reps, row.rir, row.duration].every(
            (v) => typeof v === "string" && v.length <= 24,
          ) &&
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
        ["setType", "weight", "reps", "rir", "duration"].some(
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

/** A lost response may have committed successfully. Clear that draft only after matching server values. */
export function draftMatchesSet(
  draft: DraftFields,
  set: {
    setType: SetType;
    weight: number | null;
    reps: number | null;
    rir: number | null;
    durationSeconds: number | null;
  },
) {
  const numeric = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
  return (
    draft.setType === set.setType &&
    numeric(draft.weight) === set.weight &&
    numeric(draft.reps) === set.reps &&
    numeric(draft.rir) === set.rir &&
    numeric(draft.duration) === set.durationSeconds
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
