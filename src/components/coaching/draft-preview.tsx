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
import { FormError } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import {
  activateProgramDraftAction,
  askForFirstProgrammeChangesAction,
  rejectProgramDraftAction,
  reviewProgramDraftAction,
  saveProgramDraftAction,
  saveStandaloneDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";
import type { BlueprintExercise, ProgramBlueprint } from "@/domain/program-blueprint";
import { EFFORT } from "@/domain/activity-limits";
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
import { plannedRaceDate, startOn, suggestedStart } from "@/domain/programme-start";
import { planRunDays } from "@/domain/run-days";
import { formatIsoDate } from "@/lib/format";
import { AskForChangesSheet, type CoachAnswer } from "./ask-for-changes";
import { draftShape } from "./draft-shape";
import { CoachQuestions } from "./coach-questions";
import { EnduranceDraftWeeks } from "./endurance-draft-weeks";
import { builderPath, type ProgrammeBase } from "./programme-paths";
import { RunDaysSheet } from "./run-days-sheet";

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
 * reasoning as its note at two lines, its doubts folded with their count, then what the coach
 * asks the athlete to confirm, the start date and Start programme, Ask for changes, Edit draft
 * and Discard draft, all on the first screen (ADR 0063). What it is made of follows, a dated
 * plan's run days first with the way to move them, each week or day folded, each session a row
 * that opens on its steps.
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
  titled = true,
}: {
  draft: ProgramDraft;
  library: { slug: string; name: string }[];
  today: string;
  base: ProgrammeBase;
  stale: boolean;
  machines: { id: string; unit: string }[];
  preferredUnit: "kg" | "lb";
  /** What a carry's targets read in: metres, or yards beside miles (ADR 0055). */
  length: SetLengthUnit;
  units?: SportUnits;
  preview?: boolean;
  /**
   * Whether the preview names the programme itself. Off where the page's own title is the
   * programme's name, so the screen never stands two headlines over each other.
   */
  titled?: boolean;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [current, setCurrent] = useState(draft),
    // Written before the athlete's latest data: checked against it as it starts, not as a step
    // of its own, as setup's ready programme does.
    [needsCheck, setNeedsCheck] = useState(stale || draft.status === "editing"),
    // The start the coach counted from, while it is still to come (ADR 0059); after it, a race
    // plan keeps its dates and any other plan its weekdays (ADR 0063).
    [startDate, setStartDate] = useState(() => suggestedStart(draft.blueprint, today)),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    // Discarding cannot be undone: the coach's work goes, so it is asked once (DESIGN.md).
    [confirmingDiscard, setConfirmingDiscard] = useState(false),
    [asking, setAsking] = useState(false),
    [movingDays, setMovingDays] = useState(false),
    [requestKey] = useState(() => crypto.randomUUID());
  const busy = saving || navigating;
  const editable = ["editing", "ready"].includes(current.status);
  const plannedStart =
    current.blueprint.startsOn && current.blueprint.startsOn >= today
      ? current.blueprint.startsOn
      : null;
  // A race plan keeps every date whatever start is chosen: what it leaves out is said here.
  const raceDate = plannedRaceDate(current.blueprint);
  const start = startOn(current.blueprint, startDate || today);
  const year = today.slice(0, 4);
  // A first programme is asked again with the athlete's answers; a dated run, ride or swim
  // plan's days move at once (ADR 0063).
  const first = current.baseProgramId === null && !current.standalone;
  const runDays =
    !current.standalone && current.sport !== "strength" ? planRunDays(current.blueprint) : [];
  const sheetOpen = confirmingDiscard || asking || movingDays;
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

  async function ask(notes: string, answers: CoachAnswer[]) {
    if (preview) {
      setError("Preview only — nothing was sent.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await coachingAction(() =>
      askForFirstProgrammeChangesAction(current.id, notes, requestKey, answers),
    );
    if (result.ok)
      startNavigation(() =>
        router.push(
          (base === "/plan"
            ? `/plan/requests/${result.value.jobId}`
            : `/welcome/programme/jobs/${result.value.jobId}`) as Route,
        ),
      );
    else setError(result.error);
    setSaving(false);
  }

  async function moveDays(blueprint: ProgramBlueprint) {
    if (preview) {
      setError("Preview only — no runs were moved.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await coachingAction(() =>
      saveProgramDraftAction(blueprint, current.id, current.revision),
    );
    if (result.ok) {
      // Saved as the athlete's own edit: checked against their data again as it starts.
      setCurrent(result.value);
      setNeedsCheck(true);
      setMovingDays(false);
    } else setError(result.error);
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
      {titled && (
        <div>
          <h2 className="type-display">{current.blueprint.name}</h2>
          <p className="mt-1 type-meta text-ink-2">{draftShape(current.blueprint)}</p>
        </div>
      )}
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
          <CoachQuestions questions={current.toConfirm} />
          {!current.standalone && (
            <Field
              label="Start date"
              info={
                raceDate
                  ? `The race stays on ${formatIsoDate(raceDate, year)}. A later start leaves out the sessions before it.`
                  : plannedStart
                    ? `The coach planned it from ${formatIsoDate(plannedStart, year)}, so each session falls on its day. Another start moves every session with it.`
                    : undefined
              }
              hint={
                start.leftOut > 0
                  ? `Leaves out ${start.leftOut} ${start.leftOut === 1 ? "session" : "sessions"} before ${formatIsoDate(startDate, year)}.`
                  : undefined
              }
            >
              <Input
                type="date"
                value={startDate}
                min={raceDate ? (plannedStart ?? today) : undefined}
                max={raceDate ?? undefined}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
          )}
          {/* One group, in the order it is decided (DESIGN.md, The Equal Actions Rule): the
              action that decides, then the other ways forward, each the full width and one
              size, then the way out in words. Three choices stand one under another; side by
              side, "Ask for changes" broke onto two lines beside a one-line Edit draft. */}
          <div className="action-stack">
            <Button size="lg" disabled={busy || !startDate} onClick={activate}>
              {busy && !sheetOpen
                ? "Saving…"
                : current.standalone
                  ? "Save session"
                  : "Start programme"}
            </Button>
            {first && (
              <Button
                size="lg"
                variant="secondary"
                disabled={busy}
                aria-haspopup="dialog"
                onClick={() => {
                  setError(null);
                  setAsking(true);
                }}
              >
                Ask for changes
              </Button>
            )}
            {!current.standalone && (
              <LinkButton
                href={
                  (current.sport === "strength"
                    ? preview
                      ? "/preview/coaching?view=manual"
                      : builderPath(base, `?draft=${current.id}`)
                    : `/plan/${current.sport}/edit?draft=${current.id}`) as Route
                }
                size="lg"
                variant="secondary"
              >
                Edit draft
              </LinkButton>
            )}
            <button
              type="button"
              className="text-action"
              disabled={busy}
              onClick={() => setConfirmingDiscard(true)}
            >
              Discard draft
            </button>
          </div>
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
          {first && (
            <AskForChangesSheet
              open={asking}
              onClose={() => setAsking(false)}
              questions={current.toConfirm}
              busy={busy}
              error={asking ? error : null}
              onSend={ask}
            />
          )}
          <FormError message={sheetOpen ? undefined : (error ?? undefined)} />
        </Card>
      ) : (
        <p className="text-sm text-ink-muted">{CLOSED[current.status] ?? current.status}</p>
      )}

      {(current.blueprint.notes || current.openingPlan) && (
        // Folds side by side are one card, a rule between them (DESIGN.md, Folds).
        <ul className="fold-list">
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

      {editable && runDays.length > 0 && (
        // The days it runs on, and the way to move them all at once.
        <div className="flex min-w-0 items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-bold">Run days</span>{" "}
            <span className="text-ink-2">
              {runDays.map((entry) => WEEKDAY_SHORT[entry.day]).join(", ")}
            </span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-haspopup="dialog"
            aria-label="Change run days"
            onClick={() => {
              setError(null);
              setMovingDays(true);
            }}
          >
            Change
          </Button>
          {movingDays && (
            <RunDaysSheet
              open
              onClose={() => setMovingDays(false)}
              blueprint={current.blueprint}
              busy={busy}
              error={error}
              onSave={moveDays}
            />
          )}
        </div>
      )}

      {!current.standalone && start.blueprint.enduranceSessions?.length ? (
        <EnduranceDraftWeeks
          sessions={start.blueprint.enduranceSessions}
          weeks={current.blueprint.weeks}
          startDate={startDate ? start.startDate : null}
          units={units}
        />
      ) : null}

      {current.standalone && (
        // One card of folds, a rule between them.
        <ul className="fold-list">
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
        // One card of folds, a rule between them.
        <ul className="fold-list">
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
