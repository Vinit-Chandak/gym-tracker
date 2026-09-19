"use client";
import { coachingAction } from "./client-action";
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
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { exerciseTargets } from "@/domain/program-diff";
import { rangeLabel } from "@/lib/labels";
import { WEEKDAY_NAMES } from "@/lib/labels";

/** "6 weeks · 4 days per cycle · 91 lifting sets per cycle", counting one of anything as one. */
function shape(blueprint: ProgramBlueprint): string {
  const sets = blueprint.days.reduce(
    (total, day) => total + day.exercises.reduce((sum, e) => sum + e.sets, 0),
    0,
  );
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  return `${plural(blueprint.weeks, "week")} · ${plural(blueprint.days.length, "day")} per cycle · ${plural(sets, "lifting set")} per cycle`;
}

/**
 * A first programme, in full, before anybody starts it.
 *
 * This is the one screen that still prints a whole programme, because there is nothing to
 * compare it against: an athlete with no programme cannot be shown a difference. Every later
 * version arrives as a change detail instead, and the programme itself lives in Cycle.
 */
export function DraftPreview({
  draft,
  library,
  today,
  base,
  stale,
  machines,
  preferredUnit,
}: {
  draft: ProgramDraft;
  library: { slug: string; name: string }[];
  today: string;
  base: "/welcome/programme" | "/profile/programme";
  stale: boolean;
  machines: { id: string; unit: string }[];
  preferredUnit: "kg" | "lb";
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(draft),
    [needsCheck, setNeedsCheck] = useState(stale || draft.status === "editing"),
    [startDate, setStartDate] = useState(today),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const editable = ["editing", "ready"].includes(current.status);
  async function check() {
    setBusy(true);
    const result = await coachingAction(() =>
      reviewProgramDraftAction(current.id, current.revision),
    );
    if (result.ok) {
      setCurrent(result.value);
      setNeedsCheck(false);
      setError(null);
    } else setError(result.error);
    setBusy(false);
  }
  async function activate() {
    setBusy(true);
    const result = await coachingAction(() =>
      activateProgramDraftAction({
        id: current.id,
        revision: current.revision,
        startDate,
        transition: "new_block",
      }),
    );
    if (result.ok) router.push("/today");
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-medium [overflow-wrap:anywhere]">{current.blueprint.name}</h1>
        <p className="text-sm text-ink-muted">{shape(current.blueprint)}</p>
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
      {current.blueprint.days.map((day) => (
        <Card key={day.dayIndex}>
          <h2 className="text-lg font-medium [overflow-wrap:anywhere]">
            {day.dayIndex}. {day.name}
          </h2>
          <p className="text-sm text-ink-muted">
            {WEEKDAY_NAMES[day.dayOfWeek]}
            {day.focus ? ` · ${day.focus}` : ""}
            {day.timeNote ? ` · ${day.timeNote}` : ""}
          </p>
          <ol className="space-y-3">
            {day.exercises.map((e, i) => (
              <li key={i}>
                <p className="font-medium [overflow-wrap:anywhere]">
                  {library.find((x) => x.slug === e.exerciseSlug)?.name ?? e.exerciseSlug}
                </p>
                <p className="text-sm text-ink-muted">{exerciseTargets(e)}</p>
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
                      Week {r.weekIndex}: {r.distanceKm ? `${span(r.distanceKm)} km · ` : ""}
                      {span(r.duration)} minutes · RPE {span(r.rpe)}
                      <p className="text-ink-muted">
                        {r.paceNote} {r.stopRule}
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
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Button disabled={busy || needsCheck || !startDate} onClick={activate}>
            {busy ? "Saving…" : "Start my programme"}
          </Button>
          <LinkButton href={`${base}/manual?draft=${current.id}` as Route} variant="secondary">
            Edit the draft
          </LinkButton>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await coachingAction(() => rejectProgramDraftAction(current.id));
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
/** "4–6", or "5" when a range's ends agree — as targets read everywhere else. */
function span(range: readonly [number, number] | null | undefined): string {
  if (!range) return "—";
  return rangeLabel(range[0], range[1]);
}
