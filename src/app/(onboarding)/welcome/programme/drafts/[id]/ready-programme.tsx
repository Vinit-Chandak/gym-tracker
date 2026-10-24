"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState, useTransition } from "react";

import { Art } from "@/components/art/art";
import { AskForChangesSheet, type CoachAnswer } from "@/components/coaching/ask-for-changes";
import { coachingAction } from "@/components/coaching/client-action";
import { CoachQuestions } from "@/components/coaching/coach-questions";
import { Button } from "@/components/ui/button";
import { CoachNoteMore } from "@/components/ui/coach-note-more";
import { FormError } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import type { OpeningPlan } from "@/domain/coaching-workflow";
import { exerciseTargets } from "@/domain/exercise-targets";
import type { BlueprintDay, ProgramBlueprint } from "@/domain/program-blueprint";
import type { SetLengthUnit } from "@/lib/distance-units";
import { formatIsoWeekdayDay } from "@/lib/format";
import { WEEKDAY_SHORT } from "@/lib/labels";
import {
  activateProgramDraftAction,
  askForFirstProgrammeChangesAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";

type Draft = {
  id: string;
  revision: number;
  status: string;
  blueprint: ProgramBlueprint;
  rationale: string;
  uncertainties: string[];
  /** What the coach asks the athlete to confirm (ADR 0063). */
  toConfirm: string[];
  openingPlan: OpeningPlan | null;
  source: "manual" | "ai" | "weekly";
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "8 weeks · 3 days a week", or "4 training days in every 5" for a cycle that is not a week. */
function shape(blueprint: ProgramBlueprint): string {
  const training = blueprint.days.filter((day) => day.includesLifting || day.includesRun).length;
  const cycle = blueprint.days.length;
  const how =
    cycle === 7
      ? `${plural(training, "day")} a week`
      : `${plural(training, "training day")} in every ${cycle}`;
  return `${plural(blueprint.weeks, cycle === 7 ? "week" : "cycle")} · ${how}`;
}

/** A day's lifting as its print's columns, a superset's two standing closer. */
function columns(day: BlueprintDay) {
  return day.exercises.map((exercise, index) => ({
    sets: exercise.sets,
    done: 0,
    pair:
      exercise.supersetGroup !== undefined &&
      day.exercises[index + 1]?.supersetGroup === exercise.supersetGroup,
  }));
}

/** "Goblet squat, chest press machine, lat pulldown and 2 more". */
function exercisesLine(day: BlueprintDay, names: Record<string, string>): string {
  const all = day.exercises.map((exercise, i) => {
    const name = names[exercise.exerciseSlug] ?? exercise.exerciseSlug;
    return i === 0 ? name : name.charAt(0).toLowerCase() + name.slice(1);
  });
  if (all.length === 0) return day.includesRun ? "A run" : "Rest";
  if (all.length <= 3) return all.join(", ");
  return `${all.slice(0, 3).join(", ")} and ${all.length - 3} more`;
}

/**
 * Board Your programme is ready: the programme the coach wrote, in one screen: its name and
 * shape, each training day as its print with what is on it, why it is built this way as the
 * coach's note at two lines, and the first session behind a fold; the day it starts; Start my
 * programme, which ends setup and opens Today, or Ask for changes, which sends the athlete's
 * words back to the coach.
 */
export function ReadyProgramme({
  draft,
  names,
  needsCheck,
  today,
  length,
}: {
  draft: Draft;
  names: Record<string, string>;
  /** Written before the athlete's latest data: checked against it as the programme starts. */
  needsCheck: boolean;
  today: string;
  /** What a carry's targets read in: the units step's metres, or yards beside miles. */
  length: SetLengthUnit;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [startDate, setStartDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const busy = saving || navigating;
  const training = draft.blueprint.days.filter((day) => day.includesLifting || day.includesRun);

  async function start() {
    setSaving(true);
    setError(null);
    let revision = draft.revision;
    if (needsCheck) {
      const checked = await coachingAction(() => reviewProgramDraftAction(draft.id, revision));
      if (!checked.ok) {
        setError(checked.error);
        setSaving(false);
        return;
      }
      revision = checked.value.revision;
    }
    const result = await coachingAction(() =>
      activateProgramDraftAction({ id: draft.id, revision, startDate, transition: "new_block" }),
    );
    if (result.ok) startNavigation(() => router.push("/today"));
    else setError(result.error);
    setSaving(false);
  }

  async function ask(notes: string, answers: CoachAnswer[]) {
    setSaving(true);
    setError(null);
    const result = await coachingAction(() =>
      askForFirstProgrammeChangesAction(draft.id, notes, requestKey, answers),
    );
    if (result.ok)
      startNavigation(() =>
        router.replace(`/welcome/programme/jobs/${result.value.jobId}` as Route),
      );
    else setError(result.error);
    setSaving(false);
  }

  return (
    <>
      <p className="ready-name">{draft.blueprint.name}</p>
      <p className="ready-shape">{shape(draft.blueprint)}</p>

      <ul aria-label="Your week" className="ready-days">
        {training.map((day) => (
          <li key={day.dayIndex} className="ready-day">
            <span className="ready-day-print">
              {day.exercises.length > 0 ? (
                <Art
                  kind="print"
                  parts={[{ kind: "strength", columns: columns(day) }]}
                  className="size-full"
                />
              ) : (
                <Art kind="mark" sport="run" size={22} state="todo" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="ready-day-name">
                {WEEKDAY_SHORT[day.dayOfWeek]} · {day.name}
              </span>
              <span className="ready-day-sub">{exercisesLine(day, names)}</span>
            </span>
          </li>
        ))}
      </ul>

      {draft.rationale && (
        <CoachNoteMore size="body" className="mt-3">
          <span className="whitespace-pre-wrap">{draft.rationale}</span>
        </CoachNoteMore>
      )}
      <CoachQuestions questions={draft.toConfirm} className="mt-3" />

      <div className="setup-coach-more mt-3">
        {draft.openingPlan && (
          <details className="setup-fold group">
            <summary className="setup-fold-summary">
              <span className="setup-fold-title min-w-0 flex-1">Your first session</span>
              <Glyph name="chevronDown" className="glyph-18 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="space-y-2 pb-3">
              <p className="type-body">{draft.openingPlan.summary}</p>
              <ul>
                {draft.openingPlan.exercises
                  .filter((entry) => entry.action !== "drop")
                  .map((entry, i) => (
                    <li key={i} className="border-b border-hair py-2">
                      <p className="type-meta font-bold">
                        {names[entry.exerciseSlug] ?? entry.exerciseSlug}
                      </p>
                      {entry.note && <p className="type-meta-small text-ink-2">{entry.note}</p>}
                    </li>
                  ))}
              </ul>
            </div>
          </details>
        )}
        {training.some((day) => day.exercises.length > 0) && (
          <details className="setup-fold group">
            <summary className="setup-fold-summary">
              <span className="setup-fold-title min-w-0 flex-1">Every exercise</span>
              <Glyph name="chevronDown" className="glyph-18 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="pb-3">
              {training.map((day) => (
                <section key={day.dayIndex} className="mt-2">
                  <h3 className="caption-head">
                    {WEEKDAY_SHORT[day.dayOfWeek]} · {day.name}
                  </h3>
                  <ul>
                    {day.exercises.map((exercise, i) => (
                      <li key={i} className="border-b border-hair py-2">
                        <p className="type-meta font-bold">
                          {names[exercise.exerciseSlug] ?? exercise.exerciseSlug}
                        </p>
                        <p className="type-meta-small text-ink-2 tabular-nums">
                          {exerciseTargets(exercise, length)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>
        )}
        {draft.uncertainties.length > 0 && (
          <details className="setup-fold group">
            <summary className="setup-fold-summary">
              <span className="setup-fold-title min-w-0 flex-1">
                What the coach is unsure about
              </span>
              {/* How many, without opening it. */}
              <span className="type-meta-small text-ink-2 tabular-nums">
                {draft.uncertainties.length}
              </span>
              <Glyph name="chevronDown" className="glyph-18 shrink-0 group-open:rotate-180" />
            </summary>
            <ul className="space-y-1.5 pb-3">
              {draft.uncertainties.map((line, i) => (
                <li key={i} className="type-meta">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="date-row ready-start">
          <Glyph name="calendar" className="glyph-18 shrink-0" />
          <label htmlFor="ready-start" className="min-w-0 flex-1 font-bold">
            Starts
          </label>
          <span aria-hidden className="date-row-value">
            {startDate === today ? "Today" : formatIsoWeekdayDay(startDate)}
            <Glyph name="chevronDown" className="glyph-16" />
          </span>
          {/* The platform's own date picker, over the whole row and unseen. */}
          <input
            id="ready-start"
            type="date"
            value={startDate}
            min={today}
            onChange={(event) => setStartDate(event.target.value || today)}
            onClick={(event) => {
              try {
                event.currentTarget.showPicker?.();
              } catch {
                /* Already open, or not allowed here: the field still takes typing. */
              }
            }}
            className="select-row-native"
          />
        </div>
      </div>

      <PinnedActions stack>
        {!asking && <FormError message={error ?? undefined} />}
        <Button size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={start}>
          {busy && !asking ? "Starting…" : "Start my programme"}
        </Button>
        <button
          type="button"
          disabled={busy}
          aria-haspopup="dialog"
          onClick={() => setAsking(true)}
          className="text-action w-full"
        >
          Ask for changes
        </button>
      </PinnedActions>

      <AskForChangesSheet
        open={asking}
        onClose={() => setAsking(false)}
        questions={draft.toConfirm}
        busy={busy}
        error={asking ? error : null}
        onSend={ask}
      />
    </>
  );
}
