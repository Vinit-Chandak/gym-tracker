"use client";

import { useEffect, useState, useTransition } from "react";

import type { LoadUnit, PrescriptionType, SetType } from "@/domain/types";
import { canConvertLoad, convertLoad, setInUnit } from "@/lib/units";
import {
  draftMatchesSet,
  DRAFT_VALUE_FIELDS,
  readDrafts,
  removeDraft,
  touchedFields,
  writeDraft,
  type DraftContext,
  type DraftValueField,
} from "@/lib/workout-drafts";
import { attempted } from "@/lib/offline-submit";
import { deleteSetAction, logSetAction } from "@/server/actions/sessions";

import type { ExerciseVM, SetVM } from "./view-model";

const MAX_SETS = 50;

/** What is missing when a row is saved with nothing in the column it is counted in. */
const MISSING_VALUE: Record<PrescriptionType, string> = {
  reps: "Enter the reps.",
  duration: "Enter the seconds held.",
  distance: "Enter the distance in metres.",
};

export type RowState = {
  unit?: LoadUnit;
  setIndex: number;
  setType: SetType;
  weight: string;
  reps: string;
  rir: string;
  duration: string;
  /** Metres, for exercises measured by ground covered rather than by reps. */
  distance: string;
  /** Values the user has set, so a cleared field stays cleared instead of taking a ghost. */
  touched: Set<DraftValueField>;
  logged: SetVM | null;
  saving: boolean;
  error: string | null;
  dirty: boolean;
};

/** The unconfirmed prefill for one row: last session's numbers, or the rule's targets. */
export type Ghost = Partial<Record<DraftValueField, string>>;

const str = (value: number | null | undefined): string | undefined =>
  value === null || value === undefined ? undefined : String(value);

function rowFromSet(set: SetVM): RowState {
  return {
    unit: set.unit,
    setIndex: set.setIndex,
    setType: set.setType,
    weight: str(set.weight) ?? "",
    reps: str(set.reps) ?? "",
    rir: str(set.rir) ?? "",
    duration: str(set.durationSeconds) ?? "",
    distance: str(set.distanceMeters) ?? "",
    // A recorded set is the truth about itself. Editing one must never let a suggestion
    // creep back into a field the record says is empty.
    touched: new Set(DRAFT_VALUE_FIELDS),
    logged: set,
    saving: false,
    error: null,
    dirty: false,
  };
}

function emptyRow(setIndex: number): RowState {
  return {
    setIndex,
    setType: "working",
    weight: "",
    reps: "",
    rir: "",
    duration: "",
    distance: "",
    touched: new Set(),
    logged: null,
    saving: false,
    error: null,
    dirty: false,
  };
}

function initialRows(exercise: ExerciseVM): RowState[] {
  const saved = exercise.sets.map(rowFromSet);
  const coachTargets = exercise.suggestion?.kind === "coach" ? exercise.suggestion.sets : [];
  const target = Math.max(
    coachTargets.length || (exercise.planned?.sets ?? 1),
    Math.max(0, ...saved.map((r) => r.setIndex)) + (exercise.completedAt ? 0 : 1),
  );
  const rows: RowState[] = [];
  for (let i = 1; i <= Math.min(MAX_SETS, target); i++)
    rows.push(
      saved.find((r) => r.setIndex === i) ?? {
        ...emptyRow(i),
        setType: coachTargets.find((set) => set.setIndex === i)?.setType ?? "working",
      },
    );
  return rows;
}

type GhostSource = {
  setIndex: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

function toGhost(set: GhostSource): Ghost {
  return {
    weight: str(set.weight),
    reps: str(set.reps),
    rir: str(set.rir),
    duration: str(set.durationSeconds),
    distance: str(set.distanceMeters),
  };
}

/** The prefill source: the engine's targets, else the last thing logged here. */
function prefillTargets(exercise: ExerciseVM): readonly GhostSource[] {
  const suggestion = exercise.suggestion;
  if (suggestion && suggestion.sets.length > 0) return suggestion.sets;
  return exercise.previous?.sets ?? exercise.basis?.sets ?? [];
}

/** Faint prefill: the target for this set index, else the last set logged here, else the last target. */
function ghostFor(exercise: ExerciseVM, rows: readonly RowState[], index: number): Ghost {
  const targets = prefillTargets(exercise);
  const target = targets.find((s) => s.setIndex === index);
  if (target) return toGhost(target);
  const last = [...rows].filter((r) => r.setIndex < index && r.logged).pop()?.logged;
  if (last) return toGhost(last);
  const tail = targets[targets.length - 1];
  return tail ? toGhost(tail) : {};
}

/**
 * What this field will actually save.
 *
 * An untouched field takes its row's suggestion; a field the user has been in saves exactly
 * what it shows, empty included. That is the difference between "I said nothing, use the
 * target" and "I cleared this on purpose".
 */
function resolve(row: RowState, field: DraftValueField, ghost: Ghost): number | null {
  const raw = row.touched.has(field) ? row[field] : (ghost[field] ?? "");
  if (raw.trim() === "") return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function safeAction<T extends { ok: boolean }>(
  action: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  const outcome = await attempted(
    action,
    "Connection lost. Your entries are still here. Retry saving when connected.",
  );
  return outcome.ok ? outcome.value : { ok: false, error: outcome.message };
}

type Options = {
  exercise: ExerciseVM;
  userId: string;
  sessionId: string;
  /** Prefill last session's loads instead of the engine's targets. */
  /** What one set of this exercise counts: reps, seconds held, or metres covered. */
  measure: PrescriptionType;
  unit: LoadUnit;
  onLogged: (restSeconds: number) => void;
};

/**
 * Owns one exercise's set rows: their drafts, their saves and their errors.
 *
 * Each row keeps its own numbers. Nothing here writes across rows, so four sets that happen
 * to hold the same load are four records that happen to agree, not one shared value.
 */
export function useSetRows({ exercise, userId, sessionId, measure, unit, onLogged }: Options) {
  const [rows, setRows] = useState<RowState[]>(() => initialRows(exercise));
  const [pending, startTransition] = useTransition();
  const [storageError, setStorageError] = useState(false);
  const [draftContext] = useState<DraftContext>(() => ({
    userId,
    sessionId,
    workoutExerciseId: exercise.id,
    exerciseId: exercise.exercise.id,
    equipmentId: exercise.equipment?.id ?? null,
  }));

  useEffect(() => {
    try {
      const drafts = readDrafts(localStorage, draftContext);
      const restored = drafts.filter((d) => {
        const saved = exercise.sets.find((s) => s.setIndex === d.setIndex);
        if (saved && draftMatchesSet(d, saved)) {
          removeDraft(localStorage, draftContext, d.setIndex, d);
          return false;
        }
        return true;
      });
      if (!restored.length) return;
      // Hydrate device-local drafts only after the server HTML has mounted.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows((current) => {
        const byIndex = new Map(current.map((row) => [row.setIndex, row]));
        for (const draft of restored) {
          const row = byIndex.get(draft.setIndex) ?? emptyRow(draft.setIndex);
          const from = draft.unit ?? unit;
          const convertible = canConvertLoad(from, unit);
          const weight =
            draft.weight.trim() === ""
              ? ""
              : convertible
                ? String(convertLoad(Number(draft.weight.replace(",", ".")), from, unit))
                : draft.weight;
          const changedElsewhere = (row.logged?.completedAt ?? null) !== draft.baseCompletedAt;
          byIndex.set(draft.setIndex, {
            ...row,
            ...draft,
            weight,
            unit: convertible ? unit : from,
            touched: touchedFields(draft),
            dirty: true,
            error: changedElsewhere
              ? "Saved set changed elsewhere. Review your draft before updating it."
              : "Unsaved draft restored. Review and retry saving.",
          });
        }
        return [...byIndex.values()].sort((a, b) => a.setIndex - b.setIndex);
      });
    } catch {
      setStorageError(true);
    }
  }, [draftContext, exercise.sets, unit]);

  const update = (index: number, patch: Partial<RowState>) =>
    setRows((current) =>
      current.map((row) => (row.setIndex === index ? { ...row, ...patch } : row)),
    );

  const remember = (row: RowState) => {
    try {
      if (
        !writeDraft(localStorage, draftContext, {
          unit: row.unit ?? unit,
          setIndex: row.setIndex,
          setType: row.setType,
          weight: row.weight,
          reps: row.reps,
          rir: row.rir,
          duration: row.duration,
          distance: row.distance,
          touched: [...row.touched],
          baseCompletedAt: row.logged?.completedAt ?? null,
        })
      )
        setStorageError(true);
    } catch {
      setStorageError(true);
    }
  };

  const forget = (index: number) => {
    try {
      if (!removeDraft(localStorage, draftContext, index)) setStorageError(true);
    } catch {
      setStorageError(true);
    }
  };

  /** Edits one row. Values go to that row's draft; no sibling row is read or written. */
  const editRow = (row: RowState, patch: Partial<RowState>, touch?: DraftValueField) => {
    const touched = touch ? new Set(row.touched).add(touch) : row.touched;
    const next = { ...row, ...patch, touched, dirty: true };
    remember(next);
    update(row.setIndex, next);
  };

  const restore = (row: RowState) => {
    forget(row.setIndex);
    update(row.setIndex, row.logged ? rowFromSet(row.logged) : emptyRow(row.setIndex));
  };

  const logRow = (row: RowState) => {
    const ghost = ghostFor(exercise, rows, row.setIndex);
    const weight = resolve(row, "weight", ghost);
    // Exactly the measure this exercise is counted in. A carry has no reps to save, and
    // saving a zero for one would be a number nobody entered.
    const reps = measure === "reps" ? resolve(row, "reps", ghost) : null;
    const duration = measure === "duration" ? resolve(row, "duration", ghost) : null;
    const distance = measure === "distance" ? resolve(row, "distance", ghost) : null;
    const rir = resolve(row, "rir", ghost);
    if (reps === null && duration === null && distance === null) {
      update(row.setIndex, { error: MISSING_VALUE[measure] });
      return;
    }
    // The request carries a snapshot, not a live reference: an edit made while it is in
    // flight belongs to the next save, and must not be cleared by this one's answer.
    const submitted: RowState = {
      ...row,
      unit: row.unit ?? unit,
      weight: str(weight) ?? "",
      reps: str(reps === null ? null : Math.round(reps)) ?? "",
      rir: str(rir) ?? "",
      duration: str(duration === null ? null : Math.round(duration)) ?? "",
      distance: str(distance) ?? "",
      touched: new Set(DRAFT_VALUE_FIELDS),
      saving: true,
      dirty: true,
      error: null,
    };
    remember(submitted);
    update(row.setIndex, submitted);
    if (!row.logged) onLogged(exercise.coachRestSeconds ?? exercise.planned?.restMinSeconds ?? 90);
    setRows((current) =>
      row.setIndex === Math.max(...current.map((r) => r.setIndex)) && row.setIndex < MAX_SETS
        ? [...current, emptyRow(row.setIndex + 1)]
        : current,
    );
    startTransition(async () => {
      const result = await safeAction(() =>
        logSetAction({
          unit: submitted.unit,
          workoutExerciseId: exercise.id,
          expectedCompletedAt: row.logged?.completedAt ?? null,
          expectedExerciseId: draftContext.exerciseId,
          expectedEquipmentInstanceId: draftContext.equipmentId,
          setIndex: row.setIndex,
          setType: row.setType,
          weight,
          reps: reps === null ? null : Math.round(reps),
          rir,
          durationSeconds: duration === null ? null : Math.round(duration),
          distanceMeters: distance,
        }),
      );
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const next = current.map((r) =>
          r.setIndex === row.setIndex
            ? { ...rowFromSet(setInUnit(result.set, unit)), saving: false }
            : r,
        );
        const highest = Math.max(...next.map((r) => r.setIndex));
        if (row.setIndex === highest && !exercise.completedAt && highest < MAX_SETS)
          next.push(emptyRow(highest + 1));
        return next;
      });
      try {
        removeDraft(localStorage, draftContext, row.setIndex, {
          ...submitted,
          touched: [...submitted.touched],
        });
      } catch {
        setStorageError(true);
      }
    });
  };

  const removeRow = (row: RowState) => {
    if (!row.logged) {
      forget(row.setIndex);
      setRows((current) =>
        current.length > 1
          ? current.filter((r) => r.setIndex !== row.setIndex)
          : [emptyRow(row.setIndex)],
      );
      return;
    }
    update(row.setIndex, { saving: true });
    startTransition(async () => {
      const result = await safeAction(() => deleteSetAction(exercise.id, row.setIndex));
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const remaining = current.filter((r) => r.setIndex !== row.setIndex);
        return remaining.length > 0 ? remaining : [emptyRow(1)];
      });
      forget(row.setIndex);
    });
  };

  const addRow = () =>
    setRows((current) => [...current, emptyRow(Math.max(...current.map((r) => r.setIndex)) + 1)]);

  /** Rows the exercise gained back when it was reopened after being marked complete. */
  const ensureOpenRow = () =>
    setRows((current) =>
      current.some((r) => !r.logged)
        ? current
        : [...current, emptyRow(Math.max(0, ...current.map((r) => r.setIndex)) + 1)],
    );

  return {
    rows,
    pending,
    storageError,
    dirty: rows.some((row) => row.dirty),
    loggedSets: rows.filter((r) => r.logged).map((r) => r.logged as SetVM),
    ghost: (index: number) => ghostFor(exercise, rows, index),
    editRow,
    restore,
    logRow,
    removeRow,
    addRow,
    ensureOpenRow,
    canAddRow: Math.max(0, ...rows.map((r) => r.setIndex)) < MAX_SETS,
  };
}
