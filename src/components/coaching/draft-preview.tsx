"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CoachNoteMore } from "@/components/ui/coach-note-more";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
import {
  activateProgramDraftAction,
  rejectProgramDraftAction,
  reviewProgramDraftAction,
  saveStandaloneDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";
import type { BlueprintExercise, ProgramBlueprint } from "@/domain/program-blueprint";
import { EFFORT } from "@/domain/activity-limits";
import { cycleLayout, inferCycleRepeat } from "@/domain/cycle-repeat";
import { exerciseTargets } from "@/domain/exercise-targets";
import { setTargetIn, type SetLengthUnit } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { rangeLabel } from "@/lib/labels";
import { WEEKDAY_SHORT } from "@/lib/labels";
import { supersetHues, supersetStyle, type SupersetHue } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import { ActivityPlan } from "@/components/activities/activity-plan";
import { DEFAULT_SPORT_UNITS, type SportUnits } from "@/lib/distance-units";
import { enduranceSessionGroups } from "@/domain/endurance-series";
import { formatIsoDate } from "@/lib/format";
import { EnduranceDraftWeeks } from "./endurance-draft-weeks";

/**
 * "6 weeks · 4 days per cycle · 91 sets a cycle", counting one of anything as one — with the
 * cycle said the way it repeats: "3 days a week", or "11 cycles of 4 days".
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
    return `${blueprint.weeks} weeks · ${blueprint.days.length} days · Progressive`;
  const days = plural(blueprint.days.length, "day");
  const cycle =
    blueprint.days.length === 7
      ? `${days} per cycle`
      : byWeekday
        ? `${days} a week`
        : `${plural(cycles, "cycle")} of ${days}`;
  return joinFacts([plural(blueprint.weeks, "week"), cycle, `${plural(sets, "set")} a cycle`]);
}

/** How a draft stopped being open, in a word or two. */
const CLOSED: Partial<Record<ProgramDraft["status"], string>> = {
  activated: "Started",
  superseded: "Replaced by a newer draft",
  rejected: "Discarded",
};

/** Consecutive members of one superset, gathered so the group is drawn once, not per row. */
function exerciseBlocks(exercises: readonly BlueprintExercise[]) {
  const hues = supersetHues(
    exercises.map((exercise) => ({ supersetGroup: exercise.supersetGroup ?? null })),
  );
  const blocks: { hue?: SupersetHue; items: { exercise: BlueprintExercise; at: number }[] }[] = [];
  exercises.forEach((exercise, at) => {
    const hue = exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined;
    const last = blocks.at(-1);
    if (hue && last?.hue === hue) last.items.push({ exercise, at });
    else blocks.push({ hue, items: [{ exercise, at }] });
  });
  return blocks;
}

/**
 * A first programme, in full, before anybody starts it.
 *
 * This is the one screen that still prints a whole programme, because there is nothing to
 * compare it against: an athlete with no programme cannot be shown a difference. Every later
 * version arrives as a change detail instead, and the programme itself lives on its page.
 *
 * The decision leads (DESIGN.md, The Need-to-Know Rule): the name and its shape, the coach's
 * reasoning as its note at two lines, its doubts folded with their count, then the start date
 * and Start programme, Edit draft and Discard draft, all on the first screen. What it is made
 * of follows, each week or day folded, each session a row that opens on its steps.
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
    // Written before the athlete's latest data: checked against it as it starts, not as a step
    // of its own, as setup's ready programme does.
    [needsCheck, setNeedsCheck] = useState(stale || draft.status === "editing"),
    // The start the coach counted from, while it is still to come (ADR 0059): a marathon built
    // to finish on race day finishes there only if it starts where it was counted from.
    [startDate, setStartDate] = useState(() => {
      const planned = draft.blueprint.startsOn;
      return planned && planned >= today ? planned : today;
    }),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    // Discarding cannot be undone: the coach's work goes, so it is asked once (DESIGN.md).
    [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const busy = saving || navigating;
  const editable = ["editing", "ready"].includes(current.status);
  const plannedStart =
    current.blueprint.startsOn && current.blueprint.startsOn >= today
      ? current.blueprint.startsOn
      : null;
  const name = (slug: string) => library.find((entry) => entry.slug === slug)?.name ?? slug;

  async function activate() {
    if (preview) {
      setError("Preview only — no programme was started.");
      return;
    }
    setSaving(true);
    setError(null);
    let revision = current.revision;
    if (needsCheck) {
      const checked = await coachingAction(() => reviewProgramDraftAction(current.id, revision));
      if (!checked.ok) {
        setError(checked.error);
        setSaving(false);
        return;
      }
      setCurrent(checked.value);
      setNeedsCheck(false);
      revision = checked.value.revision;
    }
    if (current.standalone) {
      const saved = await coachingAction(() => saveStandaloneDraftAction(current.id, revision));
      // Saved routines and templates are set aside for now (ADR 0058): back to Plan.
      if (saved.ok) startNavigation(() => router.push("/plan"));
      else setError(saved.error);
      setSaving(false);
      return;
    }
    const result = await coachingAction(() =>
      activateProgramDraftAction({ id: current.id, revision, startDate, transition: "new_block" }),
    );
    if (result.ok) startNavigation(() => router.push("/plan"));
    else setError(result.error);
    setSaving(false);
  }

  async function discard() {
    if (preview) {
      setError("Preview only — no draft was discarded.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await coachingAction(() => rejectProgramDraftAction(current.id));
    if (result.ok) {
      setConfirmingDiscard(false);
      startNavigation(() => router.push(base));
    } else setError(result.error);
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-medium [overflow-wrap:break-word]">
          {current.blueprint.name}
        </h2>
        <p className="text-sm text-ink-muted">{shape(current.blueprint)}</p>
      </div>
      {current.rationale && (
        <CoachNoteMore size="body">
          <span className="whitespace-pre-wrap">{current.rationale}</span>
        </CoachNoteMore>
      )}
      {current.uncertainties.length > 0 && (
        <Disclosure
          summary="What the coach is unsure about"
          meta={String(current.uncertainties.length)}
        >
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {current.uncertainties.map((line, i) => (
              <li key={i} className="[overflow-wrap:break-word]">
                {line}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {editable ? (
        <Card>
          {!current.standalone && (
            <Field
              label="Start date"
              info={
                plannedStart
                  ? `The coach planned it from ${formatIsoDate(plannedStart, today.slice(0, 4))}, so each session falls on its day. Another start moves every session with it.`
                  : undefined
              }
            >
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          )}
          <Button disabled={busy || !startDate} onClick={activate}>
            {busy ? "Saving…" : current.standalone ? "Save session" : "Start programme"}
          </Button>
          {!current.standalone && (
            <LinkButton
              href={
                (current.sport === "strength"
                  ? preview
                    ? "/preview/coaching?view=manual"
                    : `${base}/manual?draft=${current.id}`
                  : `/plan/${current.sport}/edit?draft=${current.id}`) as Route
              }
              variant="secondary"
            >
              Edit draft
            </LinkButton>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmingDiscard(true)}>
            Discard draft
          </Button>
          <ConfirmSheet
            open={confirmingDiscard}
            onClose={() => setConfirmingDiscard(false)}
            title="Discard this draft?"
            description="It cannot be brought back."
            confirmLabel="Discard draft"
            pendingLabel="Discarding…"
            pending={busy}
            error={confirmingDiscard ? error : null}
            onConfirm={discard}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </Card>
      ) : (
        <p className="text-sm text-ink-muted">{CLOSED[current.status] ?? current.status}</p>
      )}

      {(current.blueprint.notes || current.openingPlan) && (
        // Folds side by side are ruled rows that share their rules, never a stack of boxes.
        <ul className="[&>li+li]:-mt-px">
          {current.blueprint.notes && (
            <li>
              <Disclosure summary="Programme details" variant="inline">
                <p className="text-sm [overflow-wrap:break-word] whitespace-pre-wrap">
                  {current.blueprint.notes}
                </p>
              </Disclosure>
            </li>
          )}
          {current.openingPlan && (
            <li>
              <Disclosure summary="Your first session" variant="inline">
                <div className="space-y-2 text-sm">
                  <p>{current.openingPlan.summary}</p>
                  {current.openingPlan.warmup.length > 0 && (
                    <p className="text-ink-muted">
                      Warm-up: {current.openingPlan.warmup.join(" ")}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {current.openingPlan.exercises.map((entry, i) => (
                      <li key={i}>
                        <strong>{name(entry.exerciseSlug)}</strong>
                        <p>{entry.note}</p>
                        <p className="text-ink-muted">
                          {entry.action === "drop"
                            ? "Left out"
                            : entry.sets
                                .map(
                                  (s) =>
                                    `${s.reps !== null ? `${s.reps} reps` : s.durationSeconds !== null ? `${s.durationSeconds} s` : s.distanceMeters !== null ? `${setTargetIn(s.distanceMeters, length)} ${length}` : "Target to find"}${s.weight === null ? " · load to find" : ` @ ${s.weight} ${machines.find((machine) => machine.id === entry.equipmentInstanceId)?.unit ?? preferredUnit}`}${s.rir === null ? "" : ` · RIR ${s.rir}`}`,
                                )
                                .join("; ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {current.openingPlan.run && (
                    <p>
                      Run:{" "}
                      {current.openingPlan.run.durationMinutes !== null
                        ? `${current.openingPlan.run.durationMinutes} min`
                        : "Time to find"}
                      {current.openingPlan.run.distanceKm !== null
                        ? `${FACT_SEPARATOR}${current.openingPlan.run.distanceKm}\u00a0km`
                        : ""}
                      {current.openingPlan.run.rpe !== null
                        ? `${FACT_SEPARATOR}Effort ${current.openingPlan.run.rpe} of ${EFFORT.max}`
                        : ""}
                      . {current.openingPlan.run.paceNote} {current.openingPlan.run.stopRule}
                    </p>
                  )}
                </div>
              </Disclosure>
            </li>
          )}
        </ul>
      )}

      {!current.standalone && current.blueprint.enduranceSessions?.length ? (
        <EnduranceDraftWeeks
          sessions={current.blueprint.enduranceSessions}
          weeks={current.blueprint.weeks}
          startDate={startDate || null}
          units={units}
        />
      ) : null}

      {current.standalone && (
        // Ruled rows that share their rules.
        <ul className="[&>li+li]:-mt-px">
          {enduranceSessionGroups(current.blueprint.enduranceSessions ?? []).map((group) => {
            const index = group.indexes[0]!;
            const session = current.blueprint.enduranceSessions![index]!;
            return (
              <li key={group.id}>
                <Disclosure
                  summary={session.name || `Session ${index + 1}`}
                  meta={
                    group.indexes.length > 1
                      ? joinFacts([
                          `${group.indexes.length} sessions`,
                          group.intervalDays
                            ? `Every ${group.intervalDays === 7 ? "week" : `${group.intervalDays} days`}`
                            : null,
                        ])
                      : `Week ${session.weekIndex}`
                  }
                  variant="inline"
                >
                  <ActivityPlan
                    sport={session.prescription.sport}
                    prescription={session.prescription}
                    showSource={false}
                    units={units}
                    flat
                    said={session.name}
                  />
                </Disclosure>
              </li>
            );
          })}
        </ul>
      )}

      {current.blueprint.days.length > 0 && (
        // Ruled rows that share their rules.
        <ul className="[&>li+li]:-mt-px">
          {current.blueprint.days.map((day) => {
            const runs = current.blueprint.runs.filter((r) => r.dayOfWeek === day.dayOfWeek);
            return (
              <li key={day.dayIndex}>
                <Disclosure
                  summary={`${day.dayIndex}. ${day.name}`}
                  meta={joinFacts([
                    WEEKDAY_SHORT[day.dayOfWeek],
                    day.exercises.length
                      ? `${day.exercises.length} exercises`
                      : day.includesRun
                        ? "Run"
                        : "Rest",
                  ])}
                  variant="inline"
                >
                  <div className="space-y-3">
                    {(day.focus || day.timeNote) && (
                      <p className="text-sm text-ink-muted">
                        {joinFacts([
                          day.focus && holdFigures(day.focus),
                          day.timeNote && holdFigures(day.timeNote),
                        ])}
                      </p>
                    )}
                    {day.exercises.length > 0 && (
                      <ol className="space-y-3">
                        {exerciseBlocks(day.exercises).map((block) => (
                          // A superset is one bracket in ink around its group, as the
                          // programme's page draws it, not a caption on each of its rows.
                          <li
                            key={block.items[0]!.at}
                            className={cn(
                              "min-w-0",
                              block.hue && "space-y-3 rounded-r-control py-2 pl-2.5 superset-row",
                            )}
                            style={block.hue ? supersetStyle(block.hue) : undefined}
                          >
                            {block.items.map(({ exercise: e, at }) => {
                              const notes = [
                                e.targetLoadNote,
                                e.notes,
                                e.progressionNotes,
                                e.keyCue,
                              ].filter((note): note is string => Boolean(note));
                              return (
                                <div key={at} className="min-w-0">
                                  <p className="font-medium [overflow-wrap:break-word]">
                                    {name(e.exerciseSlug)}
                                  </p>
                                  <p className="text-sm text-ink-muted">
                                    {exerciseTargets(e, length)}
                                  </p>
                                  {notes.length > 0 && (
                                    <Disclosure summary="Notes" variant="inline" className="mt-1">
                                      <div className="space-y-1 text-sm text-ink-muted">
                                        {notes.map((note, i) => (
                                          <p key={i} className="[overflow-wrap:break-word]">
                                            {note}
                                          </p>
                                        ))}
                                      </div>
                                    </Disclosure>
                                  )}
                                </div>
                              );
                            })}
                          </li>
                        ))}
                      </ol>
                    )}
                    {day.includesRun && runs.length > 0 && (
                      <Disclosure summary="Run targets" variant="inline">
                        <ul className="space-y-2 text-sm">
                          {runs.map((r) => (
                            <li key={r.weekIndex}>
                              Week {r.weekIndex}:{" "}
                              {r.distanceKm ? `${span(r.distanceKm)} km · ` : ""}
                              {span(r.duration)} min · Effort {span(r.rpe)}
                              <p className="text-ink-muted">
                                {r.paceNote} {r.stopRule}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Disclosure>
                    )}
                    {day.notes && <p className="text-sm text-ink-muted">{day.notes}</p>}
                  </div>
                </Disclosure>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
/** "4–6", or "5" when a range's ends agree — as targets read everywhere else. */
function span(range: readonly [number, number] | null | undefined): string {
  if (!range) return "—";
  return rangeLabel(range[0], range[1]);
}
