"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import {
  activateProgramDraftAction,
  rejectProgramDraftAction,
  reviewProgramDraftAction,
  saveStandaloneDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { EFFORT } from "@/domain/activity-limits";
import { cycleLayout, inferCycleRepeat } from "@/domain/cycle-repeat";
import { exerciseTargets } from "@/domain/exercise-targets";
import { setTargetIn, type SetLengthUnit } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { rangeLabel } from "@/lib/labels";
import { WEEKDAY_NAMES } from "@/lib/labels";
import { ActivityPlan } from "@/components/activities/activity-plan";
import { DEFAULT_SPORT_UNITS, type SportUnits } from "@/lib/distance-units";
import { enduranceSessionGroups } from "@/domain/endurance-series";

/**
 * "6 weeks · 4 days per cycle · 91 lifting sets per cycle", counting one of anything as one —
 * with the cycle said the way it repeats: "3 days a week", or "11 cycles of 4 days".
 */
function shape(blueprint: ProgramBlueprint): string {
  if (blueprint.sport && blueprint.sport !== "strength")
    return `${blueprint.weeks} weeks · ${blueprint.enduranceSessions?.length ?? 0} sessions`;
  const sets = blueprint.days.reduce(
    (total, day) => total + day.exercises.reduce((sum, e) => sum + e.sets, 0),
    0,
  );
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  // A first programme that has not chosen takes the repeat its days suggest when it starts.
  const plan = { ...blueprint, repeats: blueprint.repeats ?? inferCycleRepeat(blueprint.days) };
  const { cycles, byWeekday } = cycleLayout(plan);
  if (blueprint.repeats === "once")
    return `${blueprint.weeks} weeks · ${blueprint.days.length} days · Does not repeat`;
  const days = plural(blueprint.days.length, "day");
  const cycle =
    blueprint.days.length === 7
      ? `${days} per cycle`
      : byWeekday
        ? `${days} a week`
        : `${plural(cycles, "cycle")} of ${days}`;
  return joinFacts([
    plural(blueprint.weeks, "week"),
    cycle,
    `${plural(sets, "lifting set")} per cycle`,
  ]);
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
  length,
  units = DEFAULT_SPORT_UNITS,
  preview = false,
}: {
  draft: ProgramDraft;
  library: { slug: string; name: string }[];
  today: string;
  base: "/welcome/programme" | "/profile/programme";
  stale: boolean;
  machines: { id: string; unit: string }[];
  preferredUnit: "kg" | "lb";
  /** What a carry's targets read in: metres, or yards beside miles (ADR 0055). */
  length: SetLengthUnit;
  units?: SportUnits;
  preview?: boolean;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [current, setCurrent] = useState(draft),
    [needsCheck, setNeedsCheck] = useState(stale || draft.status === "editing"),
    [startDate, setStartDate] = useState(today),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const busy = saving || navigating;
  const editable = ["editing", "ready"].includes(current.status);
  async function check() {
    if (preview) {
      setError("Preview only — no programme was changed.");
      return;
    }
    setSaving(true);
    const result = await coachingAction(() =>
      reviewProgramDraftAction(current.id, current.revision),
    );
    if (result.ok) {
      setCurrent(result.value);
      setNeedsCheck(false);
      setError(null);
    } else setError(result.error);
    setSaving(false);
  }
  async function activate() {
    if (preview) {
      setError("Preview only — no programme was started.");
      return;
    }
    setSaving(true);
    if (current.standalone) {
      const saved = await coachingAction(() =>
        saveStandaloneDraftAction(current.id, current.revision),
      );
      if (saved.ok)
        startNavigation(() =>
          router.push(
            saved.value.sport === "strength" ? "/profile/routines" : "/training/templates",
          ),
        );
      else setError(saved.error);
      setSaving(false);
      return;
    }
    const result = await coachingAction(() =>
      activateProgramDraftAction({
        id: current.id,
        revision: current.revision,
        startDate,
        transition: "new_block",
      }),
    );
    if (result.ok) startNavigation(() => router.push("/training"));
    else setError(result.error);
    setSaving(false);
  }
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-medium [overflow-wrap:break-word]">
          {current.blueprint.name}
        </h1>
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
      {enduranceSessionGroups(current.blueprint.enduranceSessions ?? []).map((group) => {
        const index = group.indexes[0]!;
        const session = current.blueprint.enduranceSessions![index]!;
        return (
          <details key={group.id} className="border-t border-line py-2">
            <summary className="min-h-[var(--ov-target)] cursor-pointer py-3 font-medium [overflow-wrap:break-word]">
              {session.name || `Session ${index + 1}`}
              {group.indexes.length > 1
                ? ` · ${group.indexes.length} sessions${group.intervalDays ? ` · Every ${group.intervalDays === 7 ? "week" : `${group.intervalDays} days`}` : ""}`
                : ` · Week ${session.weekIndex}`}
            </summary>
            {!current.standalone && (
              <p className="text-sm text-ink-2">
                Week {session.weekIndex} · Day {session.dayOffset + 1} from the start
              </p>
            )}
            <ActivityPlan
              sport={session.prescription.sport}
              prescription={session.prescription}
              showSource={false}
              units={units}
            />
          </details>
        );
      })}
      {current.blueprint.days.map((day) => (
        <details key={day.dayIndex} className="border-t border-line py-2">
          <summary className="min-h-[var(--ov-target)] cursor-pointer py-3 text-lg font-medium [overflow-wrap:break-word]">
            {day.dayIndex}. {day.name}
            <span className="ml-2 text-sm font-normal text-ink-2">
              {day.exercises.length ? `${day.exercises.length} exercises` : "Rest"}
            </span>
          </summary>
          <p className="text-sm text-ink-muted">
            {WEEKDAY_NAMES[day.dayOfWeek]}
            {day.focus ? `${FACT_SEPARATOR}${holdFigures(day.focus)}` : ""}
            {day.timeNote ? `${FACT_SEPARATOR}${holdFigures(day.timeNote)}` : ""}
          </p>
          <ol className="space-y-3">
            {day.exercises.map((e, i) => (
              <li key={i}>
                <p className="font-medium [overflow-wrap:break-word]">
                  {library.find((x) => x.slug === e.exerciseSlug)?.name ?? e.exerciseSlug}
                </p>
                <p className="text-sm text-ink-muted">{exerciseTargets(e, length)}</p>
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
              <summary className="min-h-[var(--ov-target)] cursor-pointer py-2">
                Run targets
              </summary>
              <ul className="space-y-2 text-sm">
                {current.blueprint.runs
                  .filter((r) => r.dayOfWeek === day.dayOfWeek)
                  .map((r) => (
                    <li key={r.weekIndex}>
                      Week {r.weekIndex}: {r.distanceKm ? `${span(r.distanceKm)} km · ` : ""}
                      {span(r.duration)} minutes · Effort {span(r.rpe)}
                      <p className="text-ink-muted">
                        {r.paceNote} {r.stopRule}
                      </p>
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {day.notes && <p className="text-sm text-ink-muted">{day.notes}</p>}
        </details>
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
                            `${s.reps !== null ? `${s.reps} reps` : s.durationSeconds !== null ? `${s.durationSeconds} s` : s.distanceMeters !== null ? `${setTargetIn(s.distanceMeters, length)} ${length}` : "Target to calibrate"}${s.weight === null ? " · load to calibrate" : ` @ ${s.weight} ${machines.find((machine) => machine.id === entry.equipmentInstanceId)?.unit ?? preferredUnit}`}${s.rir === null ? "" : ` · RIR ${s.rir}`}`,
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
                ? `${FACT_SEPARATOR}${current.openingPlan.run.distanceKm}\u00a0km`
                : ""}
              {current.openingPlan.run.rpe !== null
                ? `${FACT_SEPARATOR}Effort ${current.openingPlan.run.rpe} of ${EFFORT.max}`
                : ""}
              . {current.openingPlan.run.paceNote} {current.openingPlan.run.stopRule}
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
          <h2 className="font-medium">
            {current.standalone ? "Save this session" : "Start this programme"}
          </h2>
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
          {!current.standalone && (
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          )}
          <Button disabled={busy || needsCheck || !startDate} onClick={activate}>
            {busy ? "Saving…" : current.standalone ? "Save session template" : "Start my programme"}
          </Button>
          {!current.standalone && (
            <LinkButton
              href={
                (current.sport === "strength"
                  ? preview
                    ? "/preview/coaching?view=manual"
                    : `${base}/manual?draft=${current.id}`
                  : `/training/programmes/${current.sport}/edit?draft=${current.id}`) as Route
              }
              variant="secondary"
            >
              Edit the draft
            </LinkButton>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (preview) {
                setError("Preview only — no draft was discarded.");
                return;
              }
              setSaving(true);
              const result = await coachingAction(() => rejectProgramDraftAction(current.id));
              if (result.ok) startNavigation(() => router.push(base));
              else setError(result.error);
              setSaving(false);
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
