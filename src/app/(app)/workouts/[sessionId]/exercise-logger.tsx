"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { SetTable } from "@/components/ui/set-table";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import {
  CHANGING_KINDS,
  REGRESSION_WARNING_STREAK,
  WORKING_SET_TYPES,
  type SuggestionKind,
} from "@/domain/progression";
import { formatSets } from "@/domain/sets";
import { formatDay } from "@/lib/format";
import { LOAD_UNIT_LABELS, rangeLabel, restLabel, SUGGESTION_KIND_LABELS } from "@/lib/labels";
import type { DraftValueField } from "@/lib/workout-drafts";
import {
  applyFallbackAction,
  setExerciseCompletedAction,
  skipExerciseAction,
} from "@/server/actions/sessions";

import { SetGrid } from "./set-grid";
import { SetOptions } from "./set-options";
import { useSetRows, type RowState } from "./use-set-rows";
import type { ExerciseVM, SessionVM } from "./view-model";

const TABS = [
  { value: "log", label: "Log" },
  { value: "technique", label: "Technique" },
  { value: "history", label: "History" },
] as const;

type LoggerTab = (typeof TABS)[number]["value"];

function prescriptionLine(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  if (!p) return null;
  const volume =
    p.prescriptionType === "duration"
      ? `${p.sets} × ${rangeLabel(p.durationMinSeconds, p.durationMaxSeconds, " s")}`
      : `${p.sets} × ${rangeLabel(p.repMin, p.repMax)}`;
  return `${volume}${p.perSide ? " per side" : ""} @ ${rangeLabel(p.rirMin, p.rirMax)} RIR · rest ${restLabel(p.restMinSeconds, p.restMaxSeconds)}`;
}

/** The machine, or what stands in for one. The gym itself is session context, not row chrome. */
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

function suggestionHeadline(exercise: ExerciseVM, unit: string, holdAll: boolean) {
  const suggestion = exercise.suggestion;
  if (!suggestion) return null;
  const holding = holdAll && CHANGING_KINDS.has(suggestion.kind);
  const kind: SuggestionKind = holding ? "hold" : suggestion.kind;
  const first = suggestion.sets.find((s) => WORKING_SET_TYPES.has(s.setType)) ?? suggestion.sets[0];
  const load = (weight: number | null | undefined) =>
    weight === null || weight === undefined ? "the same load" : `${weight} ${unit}`;

  if (holding) {
    const previousFirst = exercise.previous?.sets.find((s) => WORKING_SET_TYPES.has(s.setType));
    return {
      kind,
      text: `Holding ${load(previousFirst?.weight)} today (rule said ${SUGGESTION_KIND_LABELS[suggestion.kind].toLowerCase()})`,
    };
  }
  switch (kind) {
    case "increase":
      return {
        kind,
        text: `Next: ${load(first?.weight)}${first?.reps !== null && first?.reps !== undefined ? ` × ${first.reps}+` : ""}`,
      };
    case "reduce":
      return { kind, text: `Drop to ${load(first?.weight)}` };
    case "extend":
      return {
        kind,
        text: first?.durationSeconds ? `Next: ${first.durationSeconds} s per set` : "Add time",
      };
    case "transfer":
      return { kind, text: `Start near ${load(first?.weight)}` };
    case "start":
      return { kind, text: "Go by the target note and RIR" };
    default:
      return { kind, text: `Keep ${load(first?.weight)}` };
  }
}

type LoggerProps = {
  exercise: ExerciseVM;
  session: SessionVM;
  userId: string;
  readOnly: boolean;
  holdAll: boolean;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLogged: (restSeconds: number) => void;
};

/**
 * One exercise, in focus. Everything here belongs to this exercise: the workout's gym,
 * programme and day are session context and are not repeated per set.
 */
export function ExerciseLogger({
  exercise,
  session,
  userId,
  readOnly,
  holdAll,
  onBack,
  onDirtyChange,
  onLogged,
}: LoggerProps) {
  const router = useRouter();
  const [tab, setTab] = useState<LoggerTab>("log");
  const [optionsFor, setOptionsFor] = useState<number | null>(null);
  const [completed, setCompleted] = useState(exercise.completedAt !== null);
  const [skipped, setSkipped] = useState(exercise.skippedAt !== null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDuration = exercise.planned?.prescriptionType === "duration";
  const unit = LOAD_UNIT_LABELS[exercise.equipment?.unit ?? session.preferredUnit];
  const unitLabel = exercise.exercise.modality === "bodyweight" ? `+${unit}` : unit;

  const sets = useSetRows({
    exercise,
    userId,
    sessionId: session.id,
    holdAll,
    isDuration,
    onLogged,
  });

  useEffect(() => {
    onDirtyChange(sets.dirty);
  }, [sets.dirty, onDirtyChange]);

  const needsDecision = exercise.decision !== null && !skipped && !readOnly;
  const editable = !readOnly && !skipped && !completed;
  const optionsRow = sets.rows.find((row) => row.setIndex === optionsFor) ?? null;
  const suggestion = suggestionHeadline(exercise, unit, holdAll);
  const prescription = prescriptionLine(exercise);
  const plannedName = exercise.planned?.plannedExerciseName;
  const substituted = plannedName !== undefined && plannedName !== exercise.exercise.name;

  const setCompletedState = (value: boolean) =>
    startTransition(async () => {
      try {
        const result = await setExerciseCompletedAction(exercise.id, value);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
      } catch {
        setMessage("Connection lost. Your entries are still here. Try again when connected.");
        return;
      }
      setCompleted(value);
      setSkipped(false);
      if (!value) sets.ensureOpenRow();
    });

  const skip = () =>
    startTransition(async () => {
      try {
        const result = await skipExerciseAction(exercise.id, skipReason.trim() || null);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
      } catch {
        setMessage("Connection lost. Try again when connected.");
        return;
      }
      setSkipped(true);
      setSkipOpen(false);
    });

  const applyFallback = (exerciseId: string, instanceId: string | null, name: string) =>
    startTransition(async () => {
      try {
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
      } catch {
        setMessage("Connection lost. Try again when connected.");
        return;
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex min-h-11 items-center gap-1 text-sm font-medium text-ink-muted"
      >
        <ChevronLeft className="size-4" aria-hidden />
        All exercises
      </button>

      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-lg font-medium [overflow-wrap:anywhere]">
            {exercise.exercise.name}
          </h2>
          <div className="flex shrink-0 gap-1">
            {completed && <Badge tone="success">Done</Badge>}
            {skipped && <Badge tone="warning">Skipped</Badge>}
          </div>
        </div>
        <p className="text-sm text-ink-muted">
          {equipmentLine(exercise, session.gym.kind)}
          {substituted ? ` · instead of ${plannedName}` : ""}
        </p>
      </div>

      <Tabs
        name="exercise"
        label="Exercise detail"
        options={TABS}
        value={tab}
        onChange={(value) => setTab(value)}
      />

      <div id="exercise-panel" role="tabpanel" aria-labelledby={`exercise-${tab}-tab`}>
        {tab === "log" && (
          <div className="space-y-3">
            {prescription && <p className="text-sm font-medium tabular-nums">{prescription}</p>}

            {editable && suggestion && (
              <div className="flex items-start gap-2">
                <Badge tone={suggestionTone(suggestion.kind)}>
                  {SUGGESTION_KIND_LABELS[suggestion.kind]}
                </Badge>
                <p className="min-w-0 text-sm font-medium">{suggestion.text}</p>
              </div>
            )}

            {/* Equipment problems come before the grid: without a machine there is nothing
                meaningful to log, so the decision has to be the first thing offered. */}
            {needsDecision && exercise.decision && (
              <div className="space-y-2 rounded-control border border-warning p-3">
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
                    disabled={!option.available || pending || sets.dirty}
                    onClick={() =>
                      applyFallback(
                        option.exerciseId,
                        option.equipmentInstanceId,
                        option.exerciseName,
                      )
                    }
                  >
                    {option.available ? "Use" : "Not possible here:"} {option.exerciseName}
                    {option.equipmentInstanceName ? ` on ${option.equipmentInstanceName}` : ""}
                  </Button>
                ))}
                <div className="action-row">
                  {sets.dirty ? (
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
                  {/* Carries the workout along, so registering it lands back here. */}
                  <LinkButton
                    href={`/gyms/${session.gym.id}/equipment/new?session=${session.id}&exercise=${exercise.id}`}
                    variant="ghost"
                    size="sm"
                  >
                    Register machine
                  </LinkButton>
                </div>
              </div>
            )}

            {sets.storageError && (
              <p role="alert" className="text-sm text-warning">
                Browser storage is unavailable. Keep this page open until your sets are saved.
              </p>
            )}

            {skipped ? (
              <p className="text-sm text-ink-muted">
                Skipped{exercise.notes ? `: ${exercise.notes}` : ""}.
              </p>
            ) : editable ? (
              <>
                <SetGrid
                  rows={sets.rows}
                  ghost={sets.ghost}
                  unitLabel={unitLabel}
                  isDuration={isDuration}
                  onEdit={sets.editRow}
                  onSave={sets.logRow}
                  onOptions={(row) => setOptionsFor(row.setIndex)}
                />
                {/* Said once, above the rows, rather than repeated in every cell. */}
                <p className="text-xs text-ink-subtle">
                  Greyed numbers are this set&apos;s suggestion. Save records them exactly as shown;
                  type over one to use your own, or clear it to leave it unknown.
                </p>
              </>
            ) : (
              <SetTable sets={sets.loggedSets} unitLabel={unitLabel} />
            )}

            {message && (
              <p role="alert" className="text-sm text-danger">
                {message}
              </p>
            )}

            {(readOnly || completed || skipped) && sets.dirty && (
              <div className="space-y-2 rounded-control border border-warning p-3">
                <p className="text-sm text-warning">
                  Unsaved drafts remain on this device.{" "}
                  {readOnly
                    ? "This workout is finished, so these entries cannot be saved here."
                    : "Reopen this exercise to retry saving."}
                </p>
                {sets.rows
                  .filter((r) => r.dirty)
                  .map((row) => (
                    <div key={row.setIndex} className="text-sm">
                      <p>
                        Set {row.setIndex}: {row.weight || "—"} {unit} · {row.reps || "—"} reps ·
                        RIR {row.rir || "—"} · {row.duration || "—"} s
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => sets.restore(row)}>
                        Discard this local draft
                      </Button>
                    </div>
                  ))}
              </div>
            )}

            {!readOnly && !skipped && (
              <div className="action-row">
                {completed ? (
                  <Button
                    variant="secondary"
                    onClick={() => setCompletedState(false)}
                    disabled={pending}
                  >
                    Reopen
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" disabled={!sets.canAddRow} onClick={sets.addRow}>
                      Add set
                    </Button>
                    <Button
                      onClick={() => setCompletedState(true)}
                      disabled={pending || sets.loggedSets.length === 0 || sets.dirty}
                    >
                      Complete
                    </Button>
                  </>
                )}
                {!completed && sets.loggedSets.length === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-2"
                    onClick={() => setSkipOpen(true)}
                    disabled={pending || sets.dirty}
                  >
                    Skip exercise
                  </Button>
                )}
              </div>
            )}
            {!readOnly && skipped && (
              <Button
                variant="secondary"
                onClick={() => setCompletedState(false)}
                disabled={pending}
              >
                Unskip
              </Button>
            )}
          </div>
        )}

        {tab === "technique" && (
          <div className="space-y-3 text-sm">
            {exercise.planned?.keyCue && (
              <p>
                <span className="text-ink-muted">Cue: </span>
                {exercise.planned.keyCue}
              </p>
            )}
            {exercise.planned?.targetLoadNote && (
              <p>
                <span className="text-ink-muted">Target load: </span>
                {exercise.planned.targetLoadNote}
              </p>
            )}
            {exercise.planned?.progressionNotes && (
              <p>
                <span className="text-ink-muted">Progression: </span>
                {exercise.planned.progressionNotes}
              </p>
            )}
            {exercise.substitutionReason && (
              <p>
                <span className="text-ink-muted">Substitution: </span>
                {exercise.substitutionReason}
              </p>
            )}
            {!exercise.planned?.keyCue &&
              !exercise.planned?.targetLoadNote &&
              !exercise.planned?.progressionNotes && (
                <p className="text-ink-muted">
                  No cues recorded for this exercise in the programme.
                </p>
              )}
            <Link
              href={`/exercises/${exercise.exercise.id}`}
              className="flex min-h-11 items-center font-medium text-accent"
            >
              Open in the exercise library
            </Link>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3 text-sm">
            <p>
              {exercise.previous
                ? `${exercise.previous.sameMachine ? "Previous on this machine" : "Previous"}: ${formatSets(exercise.previous.sets)} · ${formatDay(exercise.previous.performedAt, session.timeZone)}${exercise.previous.sameMachine ? "" : ` · ${exercise.previous.gymName}`}`
                : "No previous comparable session."}
            </p>
            {exercise.regressionStreak >= REGRESSION_WARNING_STREAK && (
              <p className="text-warning">
                Down {exercise.regressionStreak} sessions in a row here. Advice: repeat the load and
                look at sleep and recovery before adding.
              </p>
            )}
            {exercise.suggestion && (
              <Disclosure summary="Why this suggestion">
                <div className="space-y-1 text-sm text-ink-muted">
                  <p>{exercise.suggestion.reason}</p>
                  {exercise.suggestion.advice && <p>{exercise.suggestion.advice}</p>}
                  {exercise.basis && (
                    <p>
                      Based on{" "}
                      {exercise.suggestion.basis === "other_equipment"
                        ? `${exercise.basis.equipmentName ?? "another machine"} at ${exercise.basis.gymName}`
                        : "this exercise"}
                      , {formatDay(exercise.basis.performedAt, session.timeZone)}.
                    </p>
                  )}
                </div>
              </Disclosure>
            )}
            {exercise.previous && <SetTable sets={exercise.previous.sets} unitLabel={unit} />}
          </div>
        )}
      </div>

      <SetOptions
        row={optionsRow}
        ghost={optionsRow ? sets.ghost(optionsRow.setIndex) : {}}
        unitLabel={unitLabel}
        weightStep={exercise.weightStep}
        isDuration={isDuration}
        onEdit={
          sets.editRow as (row: RowState, patch: Partial<RowState>, touch?: DraftValueField) => void
        }
        onDelete={sets.removeRow}
        onClose={() => setOptionsFor(null)}
      />

      <Sheet
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        title={`Skip ${exercise.exercise.name}?`}
      >
        <div className="space-y-3">
          <Input
            value={skipReason}
            onChange={(event) => setSkipReason(event.target.value)}
            placeholder="Reason (optional)"
            maxLength={200}
            aria-label="Skip reason"
          />
          <Button variant="danger" size="lg" className="w-full" onClick={skip} disabled={pending}>
            Skip exercise
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
