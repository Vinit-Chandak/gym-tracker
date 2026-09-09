"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/ui/number-field";
import { Sheet } from "@/components/ui/sheet";
import {
  CHANGING_KINDS,
  REGRESSION_WARNING_STREAK,
  WORKING_SET_TYPES,
  type SuggestionKind,
} from "@/domain/progression";
import { formatSets, SET_LIMITS } from "@/domain/sets";
import type { SetType } from "@/domain/types";
import { formatDateTime, formatDay } from "@/lib/format";
import {
  LOAD_UNIT_LABELS,
  rangeLabel,
  restLabel,
  SET_TYPE_LABELS,
  SUGGESTION_KIND_LABELS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useSessionDrafts } from "@/components/use-session-drafts";
import {
  draftMatchesSet,
  readDrafts,
  removeDraft,
  writeDraft,
  type DraftContext,
} from "@/lib/workout-drafts";
import {
  deleteSetAction,
  logSetAction,
  setExerciseCompletedAction,
  setWarmupCompletedAction,
  skipExerciseAction,
  applyFallbackAction,
} from "@/server/actions/sessions";

import { RestTimer, startRestTimer } from "./rest-timer";
import type { ExerciseVM, SessionVM, SetVM } from "./view-model";

type RowState = {
  setIndex: number;
  setType: SetType;
  weight: string;
  reps: string;
  rir: string;
  duration: string;
  logged: SetVM | null;
  saving: boolean;
  error: string | null;
  dirty: boolean;
};

type Ghost = { weight?: string; reps?: string; rir?: string; duration?: string };

const str = (value: number | null | undefined): string | undefined =>
  value === null || value === undefined ? undefined : String(value);

function rowFromSet(set: SetVM): RowState {
  return {
    setIndex: set.setIndex,
    setType: set.setType,
    weight: str(set.weight) ?? "",
    reps: str(set.reps) ?? "",
    rir: str(set.rir) ?? "",
    duration: str(set.durationSeconds) ?? "",
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
    logged: null,
    saving: false,
    error: null,
    dirty: false,
  };
}

function initialRows(exercise: ExerciseVM): RowState[] {
  const saved = exercise.sets.map(rowFromSet);
  const target = Math.max(
    exercise.planned?.sets ?? 1,
    Math.max(0, ...saved.map((r) => r.setIndex)) + (exercise.completedAt ? 0 : 1),
  );
  const rows: RowState[] = [];
  for (let i = 1; i <= Math.min(50, target); i++)
    rows.push(saved.find((r) => r.setIndex === i) ?? emptyRow(i));
  return rows;
}

type GhostSource = {
  setIndex: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
};

function toGhost(set: GhostSource): Ghost {
  return {
    weight: str(set.weight),
    reps: str(set.reps),
    rir: str(set.rir),
    duration: str(set.durationSeconds),
  };
}

/** The prefill source: the engine's targets, or last session's sets when holding loads today. */
function prefillTargets(exercise: ExerciseVM, holdAll: boolean): readonly GhostSource[] {
  const suggestion = exercise.suggestion;
  if (
    suggestion &&
    suggestion.sets.length > 0 &&
    !(holdAll && CHANGING_KINDS.has(suggestion.kind))
  ) {
    return suggestion.sets;
  }
  return exercise.previous?.sets ?? exercise.basis?.sets ?? [];
}

/** Faint prefill: the target for this set index, else the last set logged here, else the last target. */
function ghostFor(exercise: ExerciseVM, rows: RowState[], index: number, holdAll: boolean): Ghost {
  const targets = prefillTargets(exercise, holdAll);
  const target = targets.find((s) => s.setIndex === index);
  if (target) return toGhost(target);
  const last = [...rows].filter((r) => r.setIndex < index && r.logged).pop()?.logged;
  if (last) return toGhost(last);
  const tail = targets[targets.length - 1];
  return tail ? toGhost(tail) : {};
}

function suggestionTone(kind: SuggestionKind): "neutral" | "accent" | "success" | "warning" {
  switch (kind) {
    case "increase":
      return "success";
    case "reduce":
    case "repeat":
      return "warning";
    case "hold":
    case "extend":
      return "accent";
    default:
      return "neutral";
  }
}

function SuggestionLine({
  exercise,
  unit,
  holdAll,
  timeZone,
}: {
  exercise: ExerciseVM;
  unit: string;
  holdAll: boolean;
  timeZone: string;
}) {
  const suggestion = exercise.suggestion;
  if (!suggestion) return null;
  const holding = holdAll && CHANGING_KINDS.has(suggestion.kind);
  const kind: SuggestionKind = holding ? "hold" : suggestion.kind;
  const first = suggestion.sets.find((s) => WORKING_SET_TYPES.has(s.setType)) ?? suggestion.sets[0];
  const load = (weight: number | null | undefined) =>
    weight === null || weight === undefined ? "the same load" : `${weight} ${unit}`;

  let headline: string;
  if (holding) {
    const previousFirst = exercise.previous?.sets.find((s) => WORKING_SET_TYPES.has(s.setType));
    headline = `Holding ${load(previousFirst?.weight)} today (rule said ${SUGGESTION_KIND_LABELS[suggestion.kind].toLowerCase()})`;
  } else {
    switch (kind) {
      case "increase":
        headline = `Next: ${load(first?.weight)}${first?.reps !== null && first?.reps !== undefined ? ` × ${first.reps}+` : ""}`;
        break;
      case "reduce":
        headline = `Drop to ${load(first?.weight)}`;
        break;
      case "extend":
        headline = first?.durationSeconds ? `Next: ${first.durationSeconds} s per set` : "Add time";
        break;
      case "transfer":
        headline = `Start near ${load(first?.weight)}`;
        break;
      case "start":
        headline = "Go by the target note and RIR";
        break;
      default:
        headline = `Keep ${load(first?.weight)}`;
    }
  }

  const basis = exercise.basis;
  const source =
    suggestion.basis === "other_equipment" && basis
      ? ` · from ${basis.equipmentName ?? "another machine"} at ${basis.gymName}, ${formatDay(basis.performedAt, timeZone)}`
      : basis && exercise.previous && basis.performedAt !== exercise.previous.performedAt
        ? ` · based on ${formatDay(basis.performedAt, timeZone)}`
        : "";

  return (
    <div className="flex items-start gap-2">
      <Badge tone={suggestionTone(kind)}>{SUGGESTION_KIND_LABELS[kind]}</Badge>
      <p className="min-w-0 text-sm">
        <span className="font-medium">{headline}</span>
        <span className="text-ink-muted">
          {/* On a first session the reason only restates the "No history" badge. */}
          {kind === "start" ? "" : ` · ${suggestion.reason}`}
          {suggestion.advice ? ` · ${suggestion.advice}` : ""}
          {source}
        </span>
      </p>
    </div>
  );
}

function effective(value: string, ghost: string | undefined): number | null {
  const raw = value.trim() !== "" ? value : (ghost ?? "");
  if (raw.trim() === "") return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function prescriptionLine(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  if (!p) return null;
  const volume =
    p.prescriptionType === "duration"
      ? `${p.sets} × ${rangeLabel(p.durationMinSeconds, p.durationMaxSeconds, " s")}`
      : `${p.sets} × ${rangeLabel(p.repMin, p.repMax)}`;
  return `${volume}${p.perSide ? " per side" : ""} @ ${rangeLabel(p.rirMin, p.rirMax)} RIR · rest ${restLabel(p.restMinSeconds, p.restMaxSeconds)}`;
}

function equipmentLine(exercise: ExerciseVM, gymKind: string): string {
  if (exercise.equipment) return exercise.equipment.name;
  if (!exercise.exercise.requiresEquipment) return "No equipment";
  if (
    gymKind === "gym" &&
    ["barbell", "dumbbell", "bodyweight", "mobility"].includes(exercise.exercise.modality)
  ) {
    return exercise.exercise.modality === "bodyweight"
      ? "Bodyweight (log added load)"
      : "Free weights";
  }
  return "Machine not chosen";
}

type ExerciseCardProps = {
  userId: string;
  onDirtyChange: (id: string, dirty: boolean) => void;
  exercise: ExerciseVM;
  session: SessionVM;
  readOnly: boolean;
  /** Prefill last session's loads instead of the engine's targets. */
  holdAll: boolean;
  onLogged: (restSeconds: number) => void;
};

async function safeAction<T extends { ok: boolean }>(
  action: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await action();
  } catch {
    return {
      ok: false,
      error: "Connection lost. Your entries are still here. Retry saving when connected.",
    };
  }
}

function ExerciseCard({
  userId,
  exercise,
  session,
  readOnly,
  holdAll,
  onLogged,
  onDirtyChange,
}: ExerciseCardProps) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => initialRows(exercise));
  const [completed, setCompleted] = useState(exercise.completedAt !== null);
  const [skipped, setSkipped] = useState(exercise.skippedAt !== null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftContext] = useState<DraftContext>(() => ({
    userId,
    sessionId: session.id,
    workoutExerciseId: exercise.id,
    exerciseId: exercise.exercise.id,
    equipmentId: exercise.equipment?.id ?? null,
  }));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    onDirtyChange(
      exercise.id,
      rows.some((row) => row.dirty),
    );
  }, [exercise.id, rows, onDirtyChange]);
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
          const changedElsewhere = (row.logged?.completedAt ?? null) !== draft.baseCompletedAt;
          byIndex.set(draft.setIndex, {
            ...row,
            ...draft,
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
  }, [draftContext, readOnly, exercise.sets]);
  const isDuration = exercise.planned?.prescriptionType === "duration";
  const unit = LOAD_UNIT_LABELS[exercise.equipment?.unit ?? session.preferredUnit];
  const loggedSets = rows.filter((r) => r.logged).map((r) => r.logged as SetVM);
  const needsDecision = exercise.decision !== null && !skipped && !readOnly;

  const update = (index: number, patch: Partial<RowState>) =>
    setRows((current) =>
      current.map((row) => (row.setIndex === index ? { ...row, ...patch } : row)),
    );

  const remember = (row: RowState) => {
    try {
      if (
        !writeDraft(localStorage, draftContext, {
          setIndex: row.setIndex,
          setType: row.setType,
          weight: row.weight,
          reps: row.reps,
          rir: row.rir,
          duration: row.duration,
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
  const editRow = (row: RowState, patch: Partial<RowState>) => {
    const next = { ...row, ...patch, dirty: true };
    remember(next);
    update(row.setIndex, next);
  };

  const logRow = (row: RowState) => {
    const ghost = ghostFor(exercise, rows, row.setIndex, holdAll);
    const weight = effective(row.weight, ghost.weight);
    const reps = isDuration ? null : effective(row.reps, ghost.reps);
    const duration = isDuration ? effective(row.duration, ghost.duration) : null;
    const rir = effective(row.rir, ghost.rir);
    if (reps === null && duration === null) {
      update(row.setIndex, { error: isDuration ? "Enter the seconds held." : "Enter the reps." });
      return;
    }
    const submitted = {
      ...row,
      weight: str(weight) ?? "",
      reps: str(reps === null ? null : Math.round(reps)) ?? "",
      rir: str(rir) ?? "",
      duration: str(duration === null ? null : Math.round(duration)) ?? "",
      saving: true,
      dirty: true,
      error: null,
    };
    remember(submitted);
    update(row.setIndex, submitted);
    if (!row.logged) onLogged(exercise.planned?.restMinSeconds ?? 90);
    setRows((current) =>
      row.setIndex === Math.max(...current.map((r) => r.setIndex)) && row.setIndex < 50
        ? [...current, emptyRow(row.setIndex + 1)]
        : current,
    );
    startTransition(async () => {
      const result = await safeAction(() =>
        logSetAction({
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
        }),
      );
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const next = current.map((r) =>
          r.setIndex === row.setIndex ? { ...rowFromSet(result.set), saving: false } : r,
        );
        const highest = Math.max(...next.map((r) => r.setIndex));
        if (row.setIndex === highest && !completed && highest < 50)
          next.push(emptyRow(highest + 1));
        return next;
      });
      try {
        removeDraft(localStorage, draftContext, row.setIndex, submitted);
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

  const setCompletedState = (value: boolean) =>
    startTransition(async () => {
      const result = await safeAction(() => setExerciseCompletedAction(exercise.id, value));
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setCompleted(value);
      setSkipped(false);
      if (!value)
        setRows((current) =>
          current.some((r) => !r.logged)
            ? current
            : [...current, emptyRow(Math.max(0, ...current.map((r) => r.setIndex)) + 1)],
        );
    });

  const skip = () =>
    startTransition(async () => {
      const result = await safeAction(() =>
        skipExerciseAction(exercise.id, skipReason.trim() || null),
      );
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setSkipped(true);
      setSkipOpen(false);
    });

  const applyFallback = (exerciseId: string, instanceId: string | null, name: string) =>
    startTransition(async () => {
      const result = await safeAction(() =>
        applyFallbackAction(
          exercise.id,
          exerciseId,
          instanceId,
          `Fallback at ${session.gym.name}: ${exercise.exercise.name} → ${name}`,
        ),
      );
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });

  const title = exercise.exercise.name;
  const plannedName = exercise.planned?.plannedExerciseName;
  const substituted = plannedName !== undefined && plannedName !== title;

  return (
    <Card className={cn((completed || skipped) && "opacity-80")}>
      {storageError && (
        <p role="alert" className="text-sm text-warning">
          Browser storage is unavailable. Keep this page open until your sets are saved.
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-semibold">{title}</h2>
          <p className="text-sm text-ink-muted">
            {equipmentLine(exercise, session.gym.kind)}
            {substituted ? ` · instead of ${plannedName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {exercise.planned?.supersetGroup && <Badge>Superset</Badge>}
          {completed && <Badge tone="success">Done</Badge>}
          {skipped && <Badge tone="warning">Skipped</Badge>}
        </div>
      </div>

      {prescriptionLine(exercise) && (
        <p className="text-sm font-medium tabular-nums">{prescriptionLine(exercise)}</p>
      )}
      {(exercise.planned?.keyCue || exercise.planned?.targetLoadNote) && (
        <p className="text-xs text-ink-subtle">
          {[exercise.planned?.keyCue, exercise.planned?.targetLoadNote].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* With no history the suggestion line below already says so, and says what to do
          about it; without it (a finished or skipped exercise) this line has to carry it. */}
      {(exercise.previous || readOnly || skipped || completed) && (
        <p className="text-sm text-ink-muted">
          {exercise.previous
            ? `${exercise.previous.sameMachine ? "Previous on this machine" : "Previous"}: ${formatSets(exercise.previous.sets)} · ${formatDay(exercise.previous.performedAt, session.timeZone)}${exercise.previous.sameMachine ? "" : ` · ${exercise.previous.gymName}`}`
            : "No previous comparable session"}
        </p>
      )}

      {!readOnly && !skipped && !completed && (
        <SuggestionLine
          exercise={exercise}
          unit={unit}
          holdAll={holdAll}
          timeZone={session.timeZone}
        />
      )}
      {!readOnly && !skipped && exercise.regressionStreak >= REGRESSION_WARNING_STREAK && (
        <p className="text-sm text-warning">
          Down {exercise.regressionStreak} sessions in a row here. Advice: repeat the load and look
          at sleep and recovery before adding.
        </p>
      )}

      {needsDecision && exercise.decision && (
        <div className="space-y-2 rounded-control border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium">
            {exercise.decision.resolution.status === "unavailable"
              ? "Not available at this gym"
              : `Needs ${exercise.decision.missingTypes.map((t) => t.name.toLowerCase()).join(" or ") || "a machine"} — not registered at ${session.gym.name}`}
          </p>
          {exercise.decision.fallbackOptions.map((option) => (
            <Button
              key={option.fallbackId}
              variant="secondary"
              className="w-full"
              disabled={!option.available || pending || rows.some((r) => r.dirty)}
              onClick={() =>
                applyFallback(option.exerciseId, option.equipmentInstanceId, option.exerciseName)
              }
            >
              {option.available ? "Use" : "Not possible here:"} {option.exerciseName}
              {option.equipmentInstanceName ? ` on ${option.equipmentInstanceName}` : ""}
            </Button>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {rows.some((r) => r.dirty) ? (
              <Button disabled variant="secondary" size="sm">
                Save or remove drafts first
              </Button>
            ) : (
              <LinkButton
                href={`/workouts/${session.id}/exercises/${exercise.id}/substitute`}
                variant="secondary"
                size="sm"
              >
                Add a fallback
              </LinkButton>
            )}
            <LinkButton href={`/gyms/${session.gym.id}/equipment/new`} variant="ghost" size="sm">
              Register machine
            </LinkButton>
          </div>
        </div>
      )}

      {skipped ? (
        <p className="text-sm text-ink-muted">
          Skipped{exercise.notes ? `: ${exercise.notes}` : ""}.
        </p>
      ) : completed || readOnly ? (
        <p className="text-sm tabular-nums">
          {loggedSets.length > 0
            ? `${loggedSets.length} ${loggedSets.length === 1 ? "set" : "sets"}: ${formatSets(loggedSets)}`
            : "No sets logged."}
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => {
            const ghost = ghostFor(exercise, rows, row.setIndex, holdAll);
            return (
              <li
                key={row.setIndex}
                className={cn(
                  "space-y-2 rounded-control border p-2",
                  row.logged && !row.dirty ? "border-success/40" : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-muted tabular-nums">
                    Set {row.setIndex}
                  </span>
                  <select
                    disabled={row.saving}
                    value={row.setType}
                    onChange={(event) => editRow(row, { setType: event.target.value as SetType })}
                    aria-label={`Set ${row.setIndex} type`}
                    className="h-11 rounded-control border border-line bg-surface-raised px-2 text-xs text-ink-muted"
                  >
                    {(Object.keys(SET_TYPE_LABELS) as SetType[]).map((type) => (
                      <option key={type} value={type}>
                        {SET_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label={exercise.exercise.modality === "bodyweight" ? `+${unit}` : unit}
                    value={row.weight}
                    ghost={ghost.weight}
                    onChange={(value) => editRow(row, { weight: value })}
                    step={exercise.weightStep}
                    max={SET_LIMITS.weight}
                    disabled={row.saving}
                  />
                  {isDuration ? (
                    <NumberField
                      label="Seconds"
                      value={row.duration}
                      ghost={ghost.duration}
                      onChange={(value) => editRow(row, { duration: value })}
                      step={5}
                      max={SET_LIMITS.durationSeconds}
                      inputMode="numeric"
                      disabled={row.saving}
                    />
                  ) : (
                    <NumberField
                      label="Reps"
                      value={row.reps}
                      ghost={ghost.reps}
                      onChange={(value) => editRow(row, { reps: value })}
                      step={1}
                      max={SET_LIMITS.reps}
                      inputMode="numeric"
                      disabled={row.saving}
                    />
                  )}
                  <NumberField
                    label="RIR"
                    value={row.rir}
                    ghost={ghost.rir}
                    onChange={(value) => editRow(row, { rir: value })}
                    step={1}
                    max={SET_LIMITS.rir}
                    disabled={row.saving}
                  />
                </div>
                {row.error && (
                  <p role="alert" className="text-sm text-danger">
                    {row.error}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={row.logged ? "secondary" : "primary"}
                    disabled={row.saving}
                    onClick={() => logRow(row)}
                  >
                    {row.saving
                      ? "Saving…"
                      : row.error
                        ? "Retry save"
                        : row.logged
                          ? "Update set"
                          : "Log set"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={row.saving}
                    onClick={() => removeRow(row)}
                    aria-label={`Remove set ${row.setIndex}`}
                  >
                    ×
                  </Button>
                </div>
                <p role="status" className="text-xs text-ink-muted">
                  {row.saving
                    ? "Saving…"
                    : row.dirty
                      ? // Mid-entry is the normal state; say what is left to do, not that
                        // something has gone wrong.
                        "Not logged yet — tap Log set"
                      : row.logged
                        ? "Saved ✓"
                        : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}

      {(readOnly || completed || skipped) && rows.some((r) => r.dirty) && (
        <div className="space-y-2 rounded-control border border-warning/40 p-3">
          <p className="text-sm text-warning">
            Unsaved drafts remain on this device.{" "}
            {readOnly
              ? "This workout is finished, so these entries cannot be saved here."
              : "Reopen this exercise to retry saving."}
          </p>
          {rows
            .filter((r) => r.dirty)
            .map((row) => (
              <div key={row.setIndex} className="text-sm">
                <p>
                  Set {row.setIndex}: {row.weight || "—"} {unit} · {row.reps || "—"} reps · RIR{" "}
                  {row.rir || "—"} · {row.duration || "—"} s
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    forget(row.setIndex);
                    update(
                      row.setIndex,
                      row.logged ? rowFromSet(row.logged) : emptyRow(row.setIndex),
                    );
                  }}
                >
                  Discard this local draft
                </Button>
              </div>
            ))}
        </div>
      )}

      {!readOnly && !skipped && (
        <div className="grid grid-cols-2 gap-2">
          {completed ? (
            <Button variant="secondary" onClick={() => setCompletedState(false)} disabled={pending}>
              Reopen
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={Math.max(...rows.map((r) => r.setIndex)) >= 50}
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    emptyRow(Math.max(...current.map((r) => r.setIndex)) + 1),
                  ])
                }
              >
                Add set
              </Button>
              <Button
                onClick={() => setCompletedState(true)}
                disabled={pending || loggedSets.length === 0 || rows.some((r) => r.dirty)}
              >
                Complete
              </Button>
            </>
          )}
          {!completed && loggedSets.length === 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="col-span-2"
              onClick={() => setSkipOpen(true)}
              disabled={pending || rows.some((r) => r.dirty)}
            >
              Skip exercise
            </Button>
          )}
        </div>
      )}
      {!readOnly && skipped && (
        <Button variant="secondary" onClick={() => setCompletedState(false)} disabled={pending}>
          Unskip
        </Button>
      )}

      <Sheet open={skipOpen} onClose={() => setSkipOpen(false)} title={`Skip ${title}?`}>
        <div className="space-y-3">
          <input
            value={skipReason}
            onChange={(event) => setSkipReason(event.target.value)}
            placeholder="Reason (optional)"
            maxLength={200}
            className="h-12 w-full rounded-control border border-line bg-surface-raised px-4 text-base"
          />
          <Button variant="danger" size="lg" className="w-full" onClick={skip} disabled={pending}>
            Skip exercise
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

function CheckInSummary({ session }: { session: SessionVM }) {
  const items: [string, number | null][] = [
    ["Sleep h", session.sleepHours],
    ["Sleep q", session.sleepQuality],
    ["Energy", session.energy],
    ["Fatigue", session.fatigue],
    ["Sore", session.soreness],
    ["Back", session.backPainPre],
    ["Shin L", session.shinLeftPre],
    ["Shin R", session.shinRightPre],
  ];
  const filled = items.filter(([, value]) => value !== null);
  if (filled.length === 0) return null;
  return (
    <dl className="grid grid-cols-4 gap-2">
      {filled.map(([label, value]) => (
        <div key={label} className="rounded-control bg-surface-raised px-2 py-1.5 text-center">
          <dt className="text-xs text-ink-subtle">{label}</dt>
          <dd className="text-base font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SessionView({ session, userId }: { session: SessionVM; userId: string }) {
  const draftCount = useSessionDrafts(userId, session.id);
  const [dirtyExercises, setDirtyExercises] = useState<Set<string>>(() => new Set());
  const onDirtyChange = useCallback((id: string, dirty: boolean) => {
    setDirtyExercises((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const hasDrafts = draftCount > 0 || dirtyExercises.size > 0;
  const readOnly = session.completedAt !== null;
  const [warmupDone, setWarmupDone] = useState(session.warmupCompleted);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [holdAll, setHoldAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const [warmupError, setWarmupError] = useState<string | null>(null);
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const durationMinutes = session.completedAt
    ? Math.round(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
      )
    : null;

  const toggleWarmup = () =>
    startTransition(async () => {
      const result = await safeAction(() => setWarmupCompletedAction(session.id, !warmupDone));
      if (result.ok) setWarmupDone(!warmupDone);
      setWarmupError(result.ok ? null : result.error);
    });

  return (
    <div className="space-y-4 pb-24">
      {readOnly && (
        <Card>
          <p className="text-sm text-ink-muted">
            {formatDateTime(session.startedAt, session.timeZone)} · {session.gym.name}
            {durationMinutes !== null ? ` · ${durationMinutes} min` : ""}
          </p>
          <p className="text-sm tabular-nums">
            {totalSets} sets
            {session.bodyWeightKg !== null ? ` · body weight ${session.bodyWeightKg} kg` : ""}
          </p>
          <CheckInSummary session={session} />
          {session.notes && <p className="text-sm whitespace-pre-line">{session.notes}</p>}
        </Card>
      )}

      {!readOnly && session.warnings.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Recovery check</h2>
            <Badge tone="warning">Advice</Badge>
          </div>
          <ul className="space-y-2 text-sm">
            {session.warnings.map((warning) => (
              <li key={warning.code}>
                <span className="font-medium">{warning.title}.</span>{" "}
                <span className="text-ink-muted">{warning.advice}</span>
              </li>
            ))}
          </ul>
          <Button
            variant={holdAll ? "primary" : "secondary"}
            size="sm"
            aria-pressed={holdAll}
            onClick={() => setHoldAll((value) => !value)}
          >
            {holdAll ? "Holding loads today ✓" : "Hold loads today"}
          </Button>
          <p className="text-xs text-ink-subtle">
            Advice only. Holding prefills last session&apos;s loads instead of the rule&apos;s
            targets; any set can still be changed.
          </p>
        </Card>
      )}

      {!readOnly && session.warmup && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Warm-up</h2>
              <p className="text-sm text-ink-muted">{session.warmup.name}</p>
            </div>
            <Button
              variant={warmupDone ? "secondary" : "primary"}
              size="sm"
              onClick={toggleWarmup}
              disabled={pending}
            >
              {pending ? "Saving…" : warmupDone ? "Done ✓" : "Mark done"}
            </Button>
          </div>
          {warmupError && (
            <p role="alert" className="text-sm text-danger">
              {warmupError}
            </p>
          )}
          <button
            type="button"
            className="flex min-h-11 items-center self-start text-sm text-ink-muted underline-offset-2 hover:underline"
            onClick={() => setWarmupOpen((v) => !v)}
          >
            {warmupOpen ? "Hide drills" : "Show drills"}
          </button>
          {warmupOpen && (
            <ol className="space-y-1 text-sm">
              {session.warmup.drills.map((drill) => (
                <li key={drill.order} className="flex justify-between gap-3">
                  <span>{drill.name}</span>
                  <span className="shrink-0 text-ink-muted">{drill.dose}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {session.exercises.length === 0 && (
        <Card>
          <p className="text-sm text-ink-muted">No exercises yet. Add one to start logging.</p>
        </Card>
      )}

      {session.exercises.map((exercise) => (
        <ExerciseCard
          userId={userId}
          onDirtyChange={onDirtyChange}
          key={`${exercise.id}:${exercise.exercise.id}:${exercise.equipment?.id ?? "none"}`}
          exercise={exercise}
          session={session}
          readOnly={readOnly}
          holdAll={holdAll}
          onLogged={(seconds) => {
            if (session.restTimerEnabled) startRestTimer(session.id, seconds);
          }}
        />
      ))}

      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <LinkButton
            href={`/workouts/${session.id}/add-exercise`}
            variant="secondary"
            className="w-full"
          >
            Add exercise
          </LinkButton>
          {hasDrafts ? (
            <Button disabled className="w-full">
              Save drafts first
            </Button>
          ) : (
            <LinkButton href={`/workouts/${session.id}/finish`} className="w-full">
              Finish session
            </LinkButton>
          )}
        </div>
      )}

      {!readOnly && hasDrafts && (
        <p role="status" className="text-sm text-warning">
          Unsaved set drafts on this device. Save or remove them before finishing.
        </p>
      )}
      {!readOnly && session.restTimerEnabled && <RestTimer sessionId={session.id} />}
    </div>
  );
}
