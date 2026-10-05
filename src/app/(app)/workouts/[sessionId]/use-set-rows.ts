"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { recordSetChange } from "@/components/set-changes";
import type { LoadUnit, PrescriptionType, SetType } from "@/domain/types";
import { EFFORT_INPUT_VERSION, effortError } from "@/domain/effort";
import { WORKING_SET_TYPES } from "@/domain/progression";
import { canConvertLoad, convertLoad, setInUnit } from "@/lib/units";
import {
  draftMatchesSet,
  DRAFT_VALUE_FIELDS,
  moveDrafts,
  readDrafts,
  removeDraft,
  touchedFields,
  writeDraft,
  type DraftContext,
  type DraftValueField,
} from "@/lib/workout-drafts";
import { attempted } from "@/lib/offline-submit";

import { useLoggerActions } from "./logger-actions";
import { restSecondsOf } from "./logger-model";
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
  rpe: string;
  effortVersion?: typeof EFFORT_INPUT_VERSION;
  duration: string;
  /** Metres, for exercises measured by ground covered rather than by reps. */
  distance: string;
  /** Values the user has set, so a cleared field stays cleared instead of taking a ghost. */
  touched: Set<DraftValueField>;
  logged: SetVM | null;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  /** The athlete picked this row's type, so nothing reads it as anything else. */
  typeChosen?: boolean;
  /** Saved as a warm-up although the row started as a working set; said under the row. */
  autoWarmup?: boolean;
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
    rpe: str(set.rpe) ?? "",
    effortVersion: set.effortReported === true ? EFFORT_INPUT_VERSION : undefined,
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
    rpe: "",
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
  const coach = exercise.suggestion?.kind === "coach";
  const targets = [...(exercise.suggestion?.sets ?? [])].sort((a, b) => a.setIndex - b.setIndex);
  // The warm-up in front of the work gets rows of its own, started as warm-ups: the ramp on the
  // day's first lift, or the one logged there last time (ADR 0038). Then the work: every set the
  // coach wrote, or the programme's working sets.
  const lead = targets.findIndex((set) => set.setType !== "warmup");
  const warmups = lead === -1 ? targets.length : lead;
  const target = Math.max(
    coach
      ? targets.length || (exercise.planned?.sets ?? 1)
      : warmups + (exercise.planned?.sets ?? 1),
    Math.max(0, ...saved.map((r) => r.setIndex)) + (exercise.completedAt ? 0 : 1),
  );
  const rows: RowState[] = [];
  for (let i = 1; i <= Math.min(MAX_SETS, target); i++) {
    const planned = targets.find((set) => set.setIndex === i)?.setType;
    rows.push(
      saved.find((r) => r.setIndex === i) ?? {
        ...emptyRow(i),
        setType: coach ? (planned ?? "working") : planned === "warmup" ? "warmup" : "working",
      },
    );
  }
  return rows;
}

/** A set lighter than this share of the work, saved before any of it, is the warm-up. */
const WARMUP_SHARE = 0.9;

/**
 * The load today's work starts at: this row's own working target, else the lightest working
 * target, so every step of a pyramid the coach wrote is work. Null when nothing says.
 */
function workLoad(exercise: ExerciseVM, setIndex: number): number | null {
  const work = (exercise.suggestion?.sets ?? []).filter(
    (set) => WORKING_SET_TYPES.has(set.setType) && set.weight !== null && set.weight > 0,
  );
  const own = work.find((set) => set.setIndex === setIndex);
  if (own) return own.weight;
  return work.length > 0 ? Math.min(...work.map((set) => set.weight!)) : null;
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
  /** A new set is on the server: rest starts again from here, never before. */
  onLogged: (restSeconds: number) => void;
  /** The server has a set this screen sent: a new one, or a change to one it had. */
  /** The server has the set: its row, whether it was a new set, and the set as saved. */
  onSaved?: (setIndex: number, added: boolean, saved: { set: SetVM; autoWarmup: boolean }) => void;
};

/**
 * Owns one exercise's set rows: their drafts, their saves and their errors.
 *
 * Each row keeps its own numbers. Nothing here writes across rows, so four sets that happen
 * to hold the same load are four records that happen to agree, not one shared value.
 */
export function useSetRows({
  exercise,
  userId,
  sessionId,
  measure,
  unit,
  onLogged,
  onSaved,
}: Options) {
  const actions = useLoggerActions();
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
  // Saves and deletions still on their way to the server, each settling to whether it landed.
  const inFlight = useRef(new Set<Promise<boolean>>());
  // Drafts carried here by a machine answer, which can land after this screen has mounted, are
  // picked up when they arrive. Every keystroke writes a draft too, so only a carried one counts.
  const [draftsSeen, setDraftsSeen] = useState(0);
  useEffect(() => {
    const arrived = () => {
      try {
        if (readDrafts(localStorage, draftContext).some((draft) => draft.carried))
          setDraftsSeen((n) => n + 1);
      } catch {
        // Unreadable storage is reported by the restore below.
      }
    };
    window.addEventListener("overload:drafts", arrived);
    return () => window.removeEventListener("overload:drafts", arrived);
  }, [draftContext]);

  /** Keeps a request among those `settled` waits for until it answers, however it answers. */
  const track = <T extends { ok: boolean }>(request: Promise<T>): Promise<T> => {
    const landed = request.then(
      (result) => result.ok,
      () => false,
    );
    inFlight.current.add(landed);
    void landed.then(() => inFlight.current.delete(landed));
    return request;
  };

  /**
   * Resolves once every save and deletion sent so far has answered: true when all of them
   * landed. Completing an exercise waits on this, so a set still on its way when Complete is
   * pressed is saved first, and one that fails keeps the exercise open with its row saying why.
   */
  const settled = async (): Promise<boolean> =>
    (await Promise.all([...inFlight.current])).every(Boolean);

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
          // An unsaved row is its draft, live: every edit and every save writes the draft as
          // it changes the row. This runs again whenever the saved sets change, and restoring
          // a row being typed into, or one on its way to the server, would only add a false
          // "restored" warning to it.
          if (row.dirty) continue;
          const from = draft.unit ?? unit;
          const convertible = canConvertLoad(from, unit);
          const weight =
            draft.weight.trim() === ""
              ? ""
              : convertible
                ? String(convertLoad(Number(draft.weight.replace(",", ".")), from, unit))
                : draft.weight;
          const changedElsewhere = (row.logged?.completedAt ?? null) !== draft.baseCompletedAt;
          const { carried, ...fields } = draft;
          byIndex.set(draft.setIndex, {
            ...row,
            ...fields,
            rpe: draft.rpe ?? "",
            effortVersion: draft.effortVersion,
            weight,
            unit: convertible ? unit : from,
            touched: touchedFields(draft),
            dirty: true,
            // A row carried here by a machine answer is the one being typed, not one recovered.
            error: changedElsewhere
              ? "Saved set changed elsewhere. Review your draft before updating it."
              : carried
                ? null
                : "Unsaved draft restored. Review and retry saving.",
          });
        }
        return [...byIndex.values()].sort((a, b) => a.setIndex - b.setIndex);
      });
      // Carried once: a later visit reads it as any other draft kept on this device.
      for (const draft of restored.filter((d) => d.carried)) {
        const { carried: _carried, ...rest } = draft;
        writeDraft(localStorage, draftContext, rest);
      }
    } catch {
      setStorageError(true);
    }
  }, [draftContext, exercise.sets, unit, draftsSeen]);

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
          rpe: row.rpe,
          effortVersion: row.effortVersion,
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
    const next = {
      ...row,
      ...patch,
      // A type picked by hand is the athlete's word on what the set is.
      ...(patch.setType !== undefined ? { typeChosen: true, autoWarmup: false } : {}),
      touched,
      effortVersion: touch === "rir" || touch === "rpe" ? EFFORT_INPUT_VERSION : row.effortVersion,
      dirty: true,
    };
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
    // Effort must be entered for this set, never copied from the planned or previous effort.
    const rir = measure === "reps" ? resolve(row, "rir", {}) : null;
    const rpe = measure !== "reps" ? resolve(row, "rpe", {}) : null;
    if (reps === null && duration === null && distance === null) {
      update(row.setIndex, { error: MISSING_VALUE[measure] });
      return;
    }
    // A set well under today's working load, saved with no RIR before any of the work, is the
    // warm-up, whatever row it was typed into (ADR 0038). It is saved as one and said so under
    // the row, with one tap back. With an RIR it stays a working set: that may be a lighter day
    // on purpose, and the athlete's word is not rewritten.
    const work = workLoad(exercise, row.setIndex);
    const from = row.unit ?? unit;
    const load =
      weight === null || !canConvertLoad(from, unit) ? null : convertLoad(weight, from, unit);
    const started = rows.some(
      (other) =>
        other.setIndex < row.setIndex &&
        other.logged !== null &&
        WORKING_SET_TYPES.has(other.logged.setType) &&
        work !== null &&
        (other.logged.weight ?? 0) >= work * WARMUP_SHARE - 1e-9,
    );
    const autoWarmup =
      !row.logged &&
      !row.typeChosen &&
      row.setType === "working" &&
      measure === "reps" &&
      rir === null &&
      !exercise.equipment?.ladder?.assisted &&
      work !== null &&
      load !== null &&
      load < work * WARMUP_SHARE - 1e-9 &&
      !started;
    const setType: SetType = autoWarmup ? "warmup" : row.setType;
    const effortIssue = effortError({
      setType,
      reps,
      durationSeconds: duration,
      distanceMeters: distance,
      rir,
      rpe,
    });
    if (effortIssue) {
      update(row.setIndex, { error: effortIssue });
      return;
    }
    if (setType !== "warmup" && row.effortVersion !== EFFORT_INPUT_VERSION) {
      update(row.setIndex, {
        error: `Review and re-enter actual ${measure === "reps" ? "RIR" : "RPE"} before saving this older entry.`,
      });
      return;
    }
    // The request carries a snapshot, not a live reference: an edit made while it is in
    // flight belongs to the next save, and must not be cleared by this one's answer.
    const submitted: RowState = {
      ...row,
      setType,
      autoWarmup,
      unit: row.unit ?? unit,
      weight: str(weight) ?? "",
      reps: str(reps === null ? null : Math.round(reps)) ?? "",
      rir: str(rir) ?? "",
      rpe: str(rpe) ?? "",
      duration: str(duration === null ? null : Math.round(duration)) ?? "",
      distance: str(distance) ?? "",
      touched: new Set(DRAFT_VALUE_FIELDS),
      saving: true,
      dirty: true,
      error: null,
    };
    remember(submitted);
    update(row.setIndex, submitted);
    // Nothing moves on before the server has the set (DESIGN.md, The log): the next row, and
    // rest starting again, wait for its answer.
    startTransition(async () => {
      const result = await track(
        safeAction(() =>
          actions.logSet({
            effortInputVersion: EFFORT_INPUT_VERSION,
            unit: submitted.unit,
            workoutExerciseId: exercise.id,
            expectedCompletedAt: row.logged?.completedAt ?? null,
            expectedExerciseId: draftContext.exerciseId,
            expectedEquipmentInstanceId: draftContext.equipmentId,
            setIndex: row.setIndex,
            setType,
            weight,
            reps: reps === null ? null : Math.round(reps),
            rir,
            rpe,
            durationSeconds: duration === null ? null : Math.round(duration),
            distanceMeters: distance,
          }),
        ),
      );
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const next = current.map((r) =>
          r.setIndex === row.setIndex
            ? { ...rowFromSet(setInUnit(result.set, unit)), saving: false, autoWarmup }
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
      // The page is not rendered again for a set (ADR 0030): the list, a reopened exercise and
      // this page brought back later learn of it from here.
      recordSetChange({
        sessionId,
        workoutExerciseId: exercise.id,
        setIndex: row.setIndex,
        set: result.set,
      });
      if (!row.logged) onLogged(restSecondsOf(exercise) ?? 90);
      onSaved?.(row.setIndex, !row.logged, { set: setInUnit(result.set, unit), autoWarmup });
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
    const expectedCompletedAt = row.logged.completedAt;
    update(row.setIndex, { saving: true });
    startTransition(async () => {
      const result = await track(
        safeAction(() => actions.deleteSet(exercise.id, row.setIndex, expectedCompletedAt)),
      );
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const remaining = current.filter((r) => r.setIndex !== row.setIndex);
        return remaining.length > 0 ? remaining : [emptyRow(1)];
      });
      forget(row.setIndex);
      recordSetChange({
        sessionId,
        workoutExerciseId: exercise.id,
        setIndex: row.setIndex,
        set: null,
      });
    });
  };

  /** Puts a set saved as a warm-up back to a working set, to be saved again with its RIR. */
  const undoWarmup = (row: RowState) => editRow(row, { setType: "working" });

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
    /** A set is on its way to the server, or out of it. */
    saving: rows.some((row) => row.saving),
    /** A row holds changes nobody has asked to save yet, or a save that failed. */
    editing: rows.some((row) => row.dirty && !row.saving),
    settled,
    loggedSets: rows.filter((r) => r.logged).map((r) => r.logged as SetVM),
    ghost: (index: number) => ghostFor(exercise, rows, index),
    editRow,
    undoWarmup,
    restore,
    logRow,
    removeRow,
    addRow,
    ensureOpenRow,
    canAddRow: Math.max(0, ...rows.map((r) => r.setIndex)) < MAX_SETS,
    /**
     * A machine answer moved the exercise (a machine attached, a family's variant): what is
     * typed and not saved goes with it, to be picked up there as the rows they were.
     */
    carryDraftsTo: (to: { exerciseId: string; equipmentInstanceId: string } | null | undefined) => {
      if (!to) return;
      try {
        moveDrafts(localStorage, draftContext, {
          ...draftContext,
          exerciseId: to.exerciseId,
          equipmentId: to.equipmentInstanceId,
        });
      } catch {
        setStorageError(true);
      }
    },
  };
}
