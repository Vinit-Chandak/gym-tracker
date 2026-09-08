"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import { formatSets, workingVolume } from "@/domain/sets";
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
  };
}

function initialRows(exercise: ExerciseVM): RowState[] {
  const rows = exercise.sets.map(rowFromSet);
  const target = Math.max(
    exercise.planned?.sets ?? 1,
    rows.length + (exercise.completedAt ? 0 : 1),
  );
  for (let i = rows.length + 1; i <= target; i++) rows.push(emptyRow(i));
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
        headline = "No history yet; go by the target note and RIR";
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
          {" "}
          · {suggestion.reason}
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
  exercise: ExerciseVM;
  session: SessionVM;
  readOnly: boolean;
  /** Prefill last session's loads instead of the engine's targets. */
  holdAll: boolean;
  onLogged: (restSeconds: number) => void;
};

function ExerciseCard({ exercise, session, readOnly, holdAll, onLogged }: ExerciseCardProps) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => initialRows(exercise));
  const [completed, setCompleted] = useState(exercise.completedAt !== null);
  const [skipped, setSkipped] = useState(exercise.skippedAt !== null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isDuration = exercise.planned?.prescriptionType === "duration";
  const unit = LOAD_UNIT_LABELS[exercise.equipment?.unit ?? "kg"];
  const loggedSets = rows.filter((r) => r.logged).map((r) => r.logged as SetVM);
  const needsDecision = exercise.decision !== null && !skipped && !readOnly;

  const update = (index: number, patch: Partial<RowState>) =>
    setRows((current) =>
      current.map((row) => (row.setIndex === index ? { ...row, ...patch } : row)),
    );

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
    update(row.setIndex, { saving: true, error: null });
    startTransition(async () => {
      const result = await logSetAction({
        workoutExerciseId: exercise.id,
        setIndex: row.setIndex,
        setType: row.setType,
        weight,
        reps: reps === null ? null : Math.round(reps),
        rir,
        durationSeconds: duration === null ? null : Math.round(duration),
      });
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const next = current.map((r) =>
          r.setIndex === row.setIndex ? { ...rowFromSet(result.set), saving: false } : r,
        );
        const highest = Math.max(...next.map((r) => r.setIndex));
        if (row.setIndex === highest && !completed) next.push(emptyRow(highest + 1));
        return next;
      });
      onLogged(exercise.planned?.restMinSeconds ?? 90);
    });
  };

  const removeRow = (row: RowState) => {
    if (!row.logged) {
      setRows((current) =>
        current.length > 1 ? current.filter((r) => r.setIndex !== row.setIndex) : current,
      );
      return;
    }
    update(row.setIndex, { saving: true });
    startTransition(async () => {
      const result = await deleteSetAction(exercise.id, row.setIndex);
      if (!result.ok) {
        update(row.setIndex, { saving: false, error: result.error });
        return;
      }
      setRows((current) => {
        const remaining = current.filter((r) => r.setIndex !== row.setIndex);
        return remaining.length > 0 ? remaining : [emptyRow(1)];
      });
    });
  };

  const setCompletedState = (value: boolean) =>
    startTransition(async () => {
      const result = await setExerciseCompletedAction(exercise.id, value);
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
      const result = await skipExerciseAction(exercise.id, skipReason.trim() || null);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setSkipped(true);
      setSkipOpen(false);
    });

  const applyFallback = (exerciseId: string, instanceId: string | null, name: string) =>
    startTransition(async () => {
      const result = await applyFallbackAction(
        exercise.id,
        exerciseId,
        instanceId,
        `Fallback at ${session.gym.name}: ${exercise.exercise.name} → ${name}`,
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

      <p className="text-sm text-ink-muted">
        {exercise.previous
          ? `${exercise.previous.sameMachine ? "Previous on this machine" : "Previous"}: ${formatSets(exercise.previous.sets)} · ${formatDay(exercise.previous.performedAt, session.timeZone)}${exercise.previous.sameMachine ? "" : ` · ${exercise.previous.gymName}`}`
          : "No previous comparable session"}
      </p>

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
              disabled={!option.available || pending}
              onClick={() =>
                applyFallback(option.exerciseId, option.equipmentInstanceId, option.exerciseName)
              }
            >
              {option.available ? "Use" : "Not possible here:"} {option.exerciseName}
              {option.equipmentInstanceName ? ` on ${option.equipmentInstanceName}` : ""}
            </Button>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <LinkButton
              href={`/workouts/${session.id}/exercises/${exercise.id}/substitute`}
              variant="secondary"
              size="sm"
            >
              Add a fallback
            </LinkButton>
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
                  row.logged ? "border-success/40" : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-muted tabular-nums">
                    Set {row.setIndex}
                  </span>
                  <select
                    value={row.setType}
                    onChange={(event) =>
                      update(row.setIndex, { setType: event.target.value as SetType })
                    }
                    aria-label={`Set ${row.setIndex} type`}
                    className="h-9 rounded-control border border-line bg-surface-raised px-2 text-xs text-ink-muted"
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
                    onChange={(value) => update(row.setIndex, { weight: value })}
                    step={exercise.weightStep}
                    disabled={row.saving}
                  />
                  {isDuration ? (
                    <NumberField
                      label="Seconds"
                      value={row.duration}
                      ghost={ghost.duration}
                      onChange={(value) => update(row.setIndex, { duration: value })}
                      step={5}
                      inputMode="numeric"
                      disabled={row.saving}
                    />
                  ) : (
                    <NumberField
                      label="Reps"
                      value={row.reps}
                      ghost={ghost.reps}
                      onChange={(value) => update(row.setIndex, { reps: value })}
                      step={1}
                      inputMode="numeric"
                      disabled={row.saving}
                    />
                  )}
                  <NumberField
                    label="RIR"
                    value={row.rir}
                    ghost={ghost.rir}
                    onChange={(value) => update(row.setIndex, { rir: value })}
                    step={1}
                    max={10}
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
                    {row.saving ? "Saving…" : row.logged ? "Update set" : "Log set"}
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
                disabled={pending || loggedSets.length === 0}
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

export function SessionView({ session }: { session: SessionVM }) {
  const readOnly = session.completedAt !== null;
  const [warmupDone, setWarmupDone] = useState(session.warmupCompleted);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [holdAll, setHoldAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const volume = session.exercises.reduce((sum, e) => sum + workingVolume(e.sets), 0);
  const durationMinutes = session.completedAt
    ? Math.round(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
      )
    : null;

  const toggleWarmup = () =>
    startTransition(async () => {
      const result = await setWarmupCompletedAction(session.id, !warmupDone);
      if (result.ok) setWarmupDone(!warmupDone);
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
            {totalSets} sets · {Math.round(volume)} kg moved
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
            Advice only. Holding prefills last session&apos;s loads instead of the rule&apos;s targets; any
            set can still be changed.
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
              {warmupDone ? "Done ✓" : "Mark done"}
            </Button>
          </div>
          <button
            type="button"
            className="text-sm text-ink-muted underline-offset-2 hover:underline"
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
          key={exercise.id}
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
          <LinkButton href={`/workouts/${session.id}/finish`} className="w-full">
            Finish session
          </LinkButton>
        </div>
      )}

      {!readOnly && session.restTimerEnabled && <RestTimer sessionId={session.id} />}
    </div>
  );
}
