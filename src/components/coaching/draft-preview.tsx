"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import {
  activateProgramDraftAction,
  rejectProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";
import type { ProgramChangeAssessment } from "@/domain/program-change";
import type { BlueprintExercise, ProgramBlueprint } from "@/domain/program-blueprint";
import { WEEKDAYS } from "./intake-form";
export function DraftPreview({
  draft,
  library,
  today,
  base,
  stale,
  assessment,
  currentBlueprint,
  machines,
  preferredUnit,
}: {
  draft: ProgramDraft;
  library: { slug: string; name: string }[];
  today: string;
  base: "/welcome/programme" | "/settings/programme";
  stale: boolean;
  assessment: ProgramChangeAssessment | null;
  currentBlueprint: ProgramBlueprint | null;
  machines: { id: string; unit: string }[];
  preferredUnit: "kg" | "lb";
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(draft),
    [needsCheck, setNeedsCheck] = useState(stale || draft.status === "editing"),
    [startDate, setStartDate] = useState(today),
    [transition, setTransition] = useState<"continue" | "new_block">(
      assessment?.authority === "automatic" ? "continue" : "new_block",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const editable = ["editing", "ready"].includes(current.status);
  async function check() {
    setBusy(true);
    const result = await reviewProgramDraftAction(current.id, current.revision);
    if (result.ok) {
      setCurrent(result.value);
      setNeedsCheck(false);
      setError(null);
    } else setError(result.error);
    setBusy(false);
  }
  async function activate() {
    setBusy(true);
    const result = await activateProgramDraftAction({
      id: current.id,
      revision: current.revision,
      startDate,
      transition,
    });
    if (result.ok) router.push("/today");
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-medium">{current.blueprint.name}</h1>
        <p className="text-sm text-ink-muted">
          {current.blueprint.weeks} weeks · {current.blueprint.days.length} days per cycle ·{" "}
          {current.blueprint.days.reduce(
            (total, day) => total + day.exercises.reduce((sum, e) => sum + e.sets, 0),
            0,
          )}{" "}
          lifting sets per cycle
        </p>
        {current.rationale && <p className="text-sm whitespace-pre-wrap">{current.rationale}</p>}
        {current.blueprint.notes && (
          <p className="text-sm whitespace-pre-wrap text-ink-muted">{current.blueprint.notes}</p>
        )}
        {current.uncertainties.length > 0 && (
          <div>
            <h2 className="font-medium">What the coach is unsure about</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {current.uncertainties.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      {assessment && (
        <Card>
          <h2 className="font-medium">What changes</h2>
          <p className="text-sm">
            {assessment.authority === "review_required"
              ? "This changes the programme structure. Starting it will begin a new block; your logged workouts remain in history."
              : assessment.authority === "unchanged"
                ? "The programme structure and targets are unchanged."
                : "Exercise choices or targets change. You can keep your current position in the block."}
          </p>
          {assessment.muscleCoverage.map((day) => (
            <p key={day.dayIndex} className="text-xs text-ink-muted">
              Day {day.dayIndex}:{" "}
              {Object.entries(day.planned.sets)
                .map(([m, n]) => `${m} ${n}`)
                .join(", ") || "no known lifting targets"}{" "}
              →{" "}
              {Object.entries(day.next.sets)
                .map(([m, n]) => `${m} ${n}`)
                .join(", ") || "no known lifting targets"}
            </p>
          ))}
          {currentBlueprint && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2">
                Compare current and proposed targets
              </summary>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Current", currentBlueprint],
                  ["Proposed", current.blueprint],
                ].map(([label, plan]) => (
                  <div key={label as string} className="space-y-3 text-sm">
                    <h3 className="font-medium">{label as string}</h3>
                    <p>
                      {(plan as ProgramBlueprint).name} · {(plan as ProgramBlueprint).weeks} weeks
                    </p>
                    {(plan as ProgramBlueprint).days.map((day) => (
                      <div key={day.dayIndex}>
                        <p className="font-medium">
                          {day.name} · {WEEKDAYS[day.dayOfWeek - 1]}
                        </p>
                        {day.exercises.map((exercise, index) => (
                          <p key={index} className="mt-1 text-ink-muted">
                            {library.find((entry) => entry.slug === exercise.exerciseSlug)?.name ??
                              exercise.exerciseSlug}
                            : {targets(exercise)}
                          </p>
                        ))}
                        {(plan as ProgramBlueprint).runs
                          .filter((run) => run.dayOfWeek === day.dayOfWeek)
                          .map((run) => (
                            <p key={run.weekIndex} className="text-ink-muted">
                              Run week {run.weekIndex}: {run.duration.join("–")} min · RPE{" "}
                              {run.rpe.join("–")}
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
      )}
      {current.blueprint.days.map((day) => (
        <Card key={day.dayIndex}>
          <h2 className="text-lg font-medium">
            {day.dayIndex}. {day.name}
          </h2>
          <p className="text-sm text-ink-muted">
            {WEEKDAYS[day.dayOfWeek - 1]}
            {day.focus ? ` · ${day.focus}` : ""}
            {day.timeNote ? ` · ${day.timeNote}` : ""}
          </p>
          <ol className="space-y-3">
            {day.exercises.map((e, i) => (
              <li key={i}>
                <p className="font-medium">
                  {library.find((x) => x.slug === e.exerciseSlug)?.name ?? e.exerciseSlug}
                </p>
                <p className="text-sm text-ink-muted">
                  {e.sets} × {(e.reps ?? e.duration ?? e.distance)!.join("–")}
                  {e.duration ? " seconds" : e.distance ? " metres" : " reps"}
                  {e.perSide ? " per side" : ""} · RIR {e.rir?.join("–") ?? "unspecified"} · Rest{" "}
                  {e.rest.join("–")} s
                </p>
                {e.supersetGroup && (
                  <p className="text-xs text-accent">Superset: {e.supersetGroup}</p>
                )}
                {e.targetLoadNote && <p className="text-sm">{e.targetLoadNote}</p>}
                {e.notes && <p className="text-sm text-ink-muted">{e.notes}</p>}
                {e.progressionNotes && (
                  <p className="text-sm text-ink-muted">{e.progressionNotes}</p>
                )}
                {e.keyCue && <p className="text-sm text-ink-muted">{e.keyCue}</p>}
              </li>
            ))}
          </ol>
          {!day.includesLifting && !day.includesRun && (
            <p className="text-sm text-ink-muted">Rest / mobility</p>
          )}
          {day.includesRun && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2">Run targets</summary>
              <ul className="space-y-2 text-sm">
                {current.blueprint.runs
                  .filter((r) => r.dayOfWeek === day.dayOfWeek)
                  .map((r) => (
                    <li key={r.weekIndex}>
                      Week {r.weekIndex}: {r.duration.join("–")} minutes · RPE {r.rpe.join("–")}
                      <p className="text-ink-muted">
                        {r.paceNote} {r.shinRule}
                      </p>
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {day.notes && <p className="text-sm text-ink-muted">{day.notes}</p>}
        </Card>
      ))}
      {current.openingPlan && (
        <Card>
          <h2 className="font-medium">Your opening session</h2>
          <p className="text-sm">{current.openingPlan.summary}</p>
          {current.openingPlan.warmup.length > 0 && (
            <p className="text-sm text-ink-muted">
              Warm-up: {current.openingPlan.warmup.join(" ")}
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {current.openingPlan.exercises.map((entry, i) => (
              <li key={i}>
                <strong>
                  {library.find((e) => e.slug === entry.exerciseSlug)?.name ?? entry.exerciseSlug}
                </strong>
                <p>{entry.note}</p>
                <p className="text-ink-muted">
                  {entry.action === "drop"
                    ? "Left out"
                    : entry.sets
                        .map(
                          (s) =>
                            `${s.reps !== null ? `${s.reps} reps` : s.durationSeconds !== null ? `${s.durationSeconds} s` : s.distanceMeters !== null ? `${s.distanceMeters} m` : "Target to calibrate"}${s.weight === null ? " · load to calibrate" : ` @ ${s.weight} ${machines.find((machine) => machine.id === entry.equipmentInstanceId)?.unit ?? preferredUnit}`}${s.rir === null ? "" : ` · RIR ${s.rir}`}`,
                        )
                        .join("; ")}
                </p>
              </li>
            ))}
          </ul>
          {current.openingPlan.run && (
            <p className="text-sm">
              Run:{" "}
              {current.openingPlan.run.durationMinutes !== null
                ? `${current.openingPlan.run.durationMinutes} minutes`
                : "Duration to calibrate"}
              {current.openingPlan.run.distanceKm !== null
                ? ` · ${current.openingPlan.run.distanceKm} km`
                : ""}
              {current.openingPlan.run.rpe !== null ? ` · RPE ${current.openingPlan.run.rpe}` : ""}.{" "}
              {current.openingPlan.run.paceNote} {current.openingPlan.run.stopRule}
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Editing the programme clears this opening session. Your edited programme targets will be
            used when you start.
          </p>
        </Card>
      )}
      {editable && (
        <Card>
          <h2 className="font-medium">Start this programme</h2>
          {needsCheck && (
            <>
              <p className="text-sm text-ink-muted">
                Check this draft against your current training data before starting it.
              </p>
              <Button disabled={busy} variant="secondary" onClick={check}>
                Check current data
              </Button>
            </>
          )}
          {assessment && assessment.authority !== "review_required" && (
            <fieldset>
              <legend className="text-sm text-ink-muted">How should this take effect?</legend>
              {[
                ["continue", "Continue the current block"],
                ["new_block", "Start a new block"],
              ].map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    checked={transition === value}
                    onChange={() => setTransition(value as "continue" | "new_block")}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {transition === "new_block" && (
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          )}
          <Button disabled={busy || needsCheck || !startDate} onClick={activate}>
            {busy ? "Saving…" : current.baseProgramId ? "Use this programme" : "Start my programme"}
          </Button>
          <LinkButton href={`${base}/manual?draft=${current.id}` as Route} variant="secondary">
            Edit the draft
          </LinkButton>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await rejectProgramDraftAction(current.id);
              if (result.ok) router.push(base);
              else setError(result.error);
              setBusy(false);
            }}
          >
            Discard this draft
          </Button>
        </Card>
      )}
      {!editable && <p className="text-sm text-ink-muted">This draft is {current.status}.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
function targets(exercise: BlueprintExercise) {
  return `${exercise.sets} × ${(exercise.reps ?? exercise.duration ?? exercise.distance)!.join("–")} ${exercise.duration ? "s" : exercise.distance ? "m" : "reps"}${exercise.perSide ? " per side" : ""} · RIR ${exercise.rir?.join("–") ?? "unspecified"} · rest ${exercise.rest.join("–")} s`;
}
