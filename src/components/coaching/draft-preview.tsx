"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { PlanRow } from "@/components/planned-exercises";
import { Button, LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
import {
  activateProgramDraftAction,
  rejectProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";
import type { BlueprintDay, ProgramBlueprint } from "@/domain/program-blueprint";
import { exerciseTargets } from "@/domain/exercise-targets";
import { rangeLabel, WEEKDAY_NAMES } from "@/lib/labels";
import { supersetHues } from "@/lib/superset-colors";

import { CoachLine, ListLabel, NumberCell } from "./sheet-bits";

/** "6 weeks · 4 days per cycle · 91 lifting sets per cycle", counting one of anything as one. */
function shape(blueprint: ProgramBlueprint): string {
  const sets = blueprint.days.reduce(
    (total, day) => total + day.exercises.reduce((sum, e) => sum + e.sets, 0),
    0,
  );
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  return `${plural(blueprint.weeks, "week")} · ${plural(blueprint.days.length, "day")} per cycle · ${plural(sets, "lifting set")} per cycle`;
}

/** "Monday · Squat and hinge · 45 min": what the day is, on one line under its name. */
function daySubtitle(day: BlueprintDay): string {
  return [WEEKDAY_NAMES[day.dayOfWeek], day.focus, day.timeNote].filter(Boolean).join(" · ");
}

/**
 * One day of the draft, written out as Cycle writes a day: the number in the margin, the
 * name, then every exercise as a row of the plan with the coach's lines beneath in pen.
 */
function DraftDay({
  day,
  blueprint,
  names,
}: {
  day: BlueprintDay;
  blueprint: ProgramBlueprint;
  names: ReadonlyMap<string, string>;
}) {
  const hues = supersetHues(
    day.exercises.map((exercise) => ({ supersetGroup: exercise.supersetGroup ?? null })),
  );
  const runs = day.includesRun
    ? blueprint.runs.filter((run) => run.dayOfWeek === day.dayOfWeek)
    : [];
  return (
    <article className="min-w-0 py-4" aria-label={`Day ${day.dayIndex}, ${day.name}`}>
      <div className="flex items-start gap-3">
        <NumberCell number={day.dayIndex} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg [overflow-wrap:anywhere]">{day.name}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{daySubtitle(day)}</p>
        </div>
      </div>
      {day.exercises.length > 0 && (
        <ol className="mt-3 min-w-0 ruled-list">
          {day.exercises.map((exercise, index) => (
            <PlanRow
              key={index}
              number={index + 1}
              name={names.get(exercise.exerciseSlug) ?? exercise.exerciseSlug}
              detail={[
                exerciseTargets(exercise),
                exercise.supersetGroup ? `Superset ${exercise.supersetGroup}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              note={
                [
                  exercise.targetLoadNote,
                  exercise.notes,
                  exercise.progressionNotes,
                  exercise.keyCue,
                ]
                  .filter(Boolean)
                  .join(" ") || null
              }
              hue={exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined}
            />
          ))}
        </ol>
      )}
      {!day.includesLifting && !day.includesRun && (
        <p className="mt-2 text-sm text-ink-muted">Rest / mobility</p>
      )}
      {day.notes && <p className="mt-3 text-sm [overflow-wrap:anywhere] text-ink-muted">{day.notes}</p>}
      {runs.length > 0 && (
        <Disclosure summary="Run targets" variant="footer" className="mt-3">
          <ul className="ruled-list">
            {runs.map((run) => (
              <li key={run.weekIndex} className="py-2 text-sm">
                <p className="font-data tabular-nums">
                  Week {run.weekIndex}: {run.distanceKm ? `${span(run.distanceKm)} km · ` : ""}
                  {span(run.duration)} minutes · Effort {span(run.rpe)}
                </p>
                {(run.paceNote || run.stopRule) && (
                  <p className="mt-0.5 [overflow-wrap:anywhere] text-ink-muted">
                    {[run.paceNote, run.stopRule].filter(Boolean).join(" ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </article>
  );
}

/**
 * A first programme, in full, before anybody starts it.
 *
 * This is the one screen that still prints a whole programme, because there is nothing to
 * compare it against: an athlete with no programme cannot be shown a difference. Every later
 * version arrives as a change detail instead, and the programme itself lives in Cycle. The
 * coach's own lines are in pen; the decision to start stands off the page on a panel.
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
  const names = new Map(library.map((exercise) => [exercise.slug, exercise.name]));
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
  const opening = current.openingPlan;
  return (
    <div className="space-y-[var(--section-gap)]">
      {/* What the programme is: its name as the largest thing on the sheet, its shape in the
          data voice, and the coach's reasoning in the coach's hand. */}
      <section className="box space-y-3 py-4" aria-label={current.blueprint.name}>
        <div>
          <h2 className="text-2xl [overflow-wrap:anywhere]">{current.blueprint.name}</h2>
          <p className="mt-1 font-data text-sm text-ink-muted tabular-nums">
            {shape(current.blueprint)}
          </p>
        </div>
        {current.rationale && <CoachLine>{current.rationale}</CoachLine>}
        {current.blueprint.notes && (
          <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-ink-muted">
            {current.blueprint.notes}
          </p>
        )}
        {current.uncertainties.length > 0 && (
          <div>
            <ListLabel title="What the coach is unsure about" />
            <ul className="ruled-list">
              {current.uncertainties.map((line, i) => (
                <li key={i} className="py-2">
                  <CoachLine>{line}</CoachLine>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <ul className="box-rows">
        {current.blueprint.days.map((day) => (
          <li key={day.dayIndex}>
            <DraftDay day={day} blueprint={current.blueprint} names={names} />
          </li>
        ))}
      </ul>

      {opening && (
        <section className="box space-y-3 py-4" aria-label="Your opening session">
          <h2 className="text-lg">Your opening session</h2>
          <CoachLine>{opening.summary}</CoachLine>
          {opening.warmup.length > 0 && (
            <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
              Warm-up: {opening.warmup.join(" ")}
            </p>
          )}
          <ol className="min-w-0 ruled-list">
            {opening.exercises.map((entry, i) => (
              <PlanRow
                key={i}
                number={i + 1}
                name={names.get(entry.exerciseSlug) ?? entry.exerciseSlug}
                detail={
                  entry.action === "drop"
                    ? "Left out"
                    : entry.sets
                        .map(
                          (s) =>
                            `${s.reps !== null ? `${s.reps} reps` : s.durationSeconds !== null ? `${s.durationSeconds} s` : s.distanceMeters !== null ? `${s.distanceMeters} m` : "Target to calibrate"}${s.weight === null ? " · load to calibrate" : ` @ ${s.weight} ${machines.find((machine) => machine.id === entry.equipmentInstanceId)?.unit ?? preferredUnit}`}${s.rir === null ? "" : ` · RIR ${s.rir}`}`,
                        )
                        .join("; ")
                }
                note={entry.note || null}
                struck={entry.action === "drop"}
              />
            ))}
          </ol>
          {opening.run && (
            <p className="text-sm [overflow-wrap:anywhere]">
              <span className="font-data tabular-nums">
                Run:{" "}
                {opening.run.durationMinutes !== null
                  ? `${opening.run.durationMinutes} minutes`
                  : "Duration to calibrate"}
                {opening.run.distanceKm !== null ? ` · ${opening.run.distanceKm} km` : ""}
                {opening.run.rpe !== null ? ` · Effort ${opening.run.rpe}` : ""}.
              </span>{" "}
              <span className="text-ink-muted">
                {[opening.run.paceNote, opening.run.stopRule].filter(Boolean).join(" ")}
              </span>
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Editing the programme clears this opening session. Your edited programme targets will be
            used when you start.
          </p>
        </section>
      )}

      {editable && (
        <section className="panel space-y-3 panel-padding" aria-label="Start this programme">
          <h2 className="text-lg">Start this programme</h2>
          {needsCheck && (
            <>
              <p className="text-sm text-ink-muted">
                Check this draft against your current training data before starting it.
              </p>
              <Button
                disabled={busy}
                variant="secondary"
                className="flex w-full"
                onClick={check}
              >
                Check current data
              </Button>
            </>
          )}
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Button
            size="lg"
            className="flex w-full"
            disabled={busy || needsCheck || !startDate}
            onClick={activate}
          >
            {busy ? "Saving…" : "Start my programme"}
          </Button>
          <div className="action-row">
            <LinkButton
              href={`${base}/manual?draft=${current.id}` as Route}
              variant="secondary"
              className="w-full"
            >
              Edit the draft
            </LinkButton>
            <Button
              variant="danger"
              className="w-full"
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
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </section>
      )}
      {!editable && <p className="text-sm text-ink-muted">This draft is {current.status}.</p>}
      {!editable && error && (
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
