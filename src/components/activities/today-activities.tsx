import { Art } from "@/components/art/art";
import Link from "@/components/ui/app-link";
import { ActivityCard } from "@/components/ui/activity-card";
import { LinkButton } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { FigureText } from "@/components/ui/figure-text";
import { Figures } from "@/components/ui/figures";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import type { ActivitySport } from "@/domain/activity";
import { describePrescription, expandSteps } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

import { PHASE_LABELS, sessionLine, stepLine } from "./activity-plan";
import { enduranceName, enduranceNote, enduranceTarget } from "./endurance-line";

const MARK: Record<Exclude<ActivitySport, "strength">, "run" | "ride" | "swim"> = {
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/** "Log run", "Log ride", "Log swim": the action names the sport, so three cards never share it. */
const LOG_LABEL: Record<Exclude<ActivitySport, "strength">, string> = {
  running: "Log run",
  cycling: "Log ride",
  swimming: "Log swim",
};

/** A fact of a card's meta line, led by its glyph (DESIGN.md, Rows and marks). */
function Fact({ glyph, children }: { glyph: GlyphName; children: React.ReactNode }) {
  return (
    <span className="meta-fact">
      <Glyph name={glyph} className="glyph-16" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

/**
 * The whole of an endurance session, for its card's fold: the steps as written, the targets for
 * the session, how to run it, and the coach's word on it where the coach wrote one. Then the
 * way to skip or move it, which is its own page (plan §7).
 */
function EnduranceDetails({
  occurrence,
  coachSummary,
}: {
  occurrence: ScheduledOccurrence;
  coachSummary?: string | null;
}) {
  const prescription = occurrence.prescription;
  const steps = prescription ? expandSteps(prescription) : [];
  const overall = prescription ? sessionLine(prescription) : null;
  const how = [
    ["Pace", prescription?.running?.paceNote],
    ["Progression", prescription?.running?.progressionNote],
    ["Stop if", prescription?.running?.symptomStopRule],
    ["Note", prescription?.running?.note],
    ["How to do it", prescription?.instructions],
    ["Note", prescription?.notes],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <div className="activity-card-plan">
      {coachSummary && (
        <CoachNote flat small className="activity-card-passage">
          {coachSummary}
        </CoachNote>
      )}
      {(overall || steps.length > 0) && (
        <div className="activity-card-passage">
          {overall && <p className="type-meta font-semibold tabular-nums">{overall}</p>}
          {steps.length > 0 && (
            <ol className="mt-1 space-y-1">
              {steps.map((step, index) => (
                <li
                  key={`${step.id}-${step.repetition}-${index}`}
                  className="type-meta-small [overflow-wrap:anywhere] tabular-nums"
                >
                  <span className="text-ink-2">{PHASE_LABELS[step.phase]}</span> {stepLine(step)}
                  {step.notes && <span className="text-ink-2"> · {step.notes}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {how.length > 0 && (
        <dl className="activity-card-passage space-y-2">
          {how.map(([label, value], index) => (
            <div key={`${label}-${index}`} className="min-w-0">
              <dt className="type-caption text-ink-2">{label}</dt>
              <dd className="type-meta [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link
        href={`/training/programme/occurrences/${occurrence.id}`}
        className="activity-card-link"
      >
        {occurrence.disposition === "skipped" ? "Undo skip or move" : "Skip or move"}
        <Glyph name="chevronRight" className="glyph-18" />
      </Link>
    </div>
  );
}

/**
 * A run, a ride or a swim owed today, whatever put it there (plan §2.3), as a card of its own
 * in the workout's style (DESIGN.md, Today): the sport's mark in its state, the name and what
 * it asks for, how to do it and when, the whole session folded behind the head, and its own
 * Log button.
 *
 * Two sources meet here and neither is allowed to pretend to be the other. Work the athlete put
 * on the calendar is here because it is dated today. The programme's own endurance is here
 * because the sequence has reached the day it belongs to, never because its original date
 * happens to be today, which is what showed a run from a day nobody had got to yet (TODAY-01).
 * The caller decides which it is asking for; the card only says so.
 */
export function EnduranceCard({
  occurrence,
  partOf,
  coachSummary,
}: {
  /** `preparedByCoach` when the prescription is the coach's preparation for today. */
  occurrence: ScheduledOccurrence & { preparedByCoach?: boolean };
  /** The programme day it belongs to, when that is not obvious ("Part of Easy Run + Arms"). */
  partOf?: string | null;
  /** The coach's own words for this sport, on the day it planned. */
  coachSummary?: string | null;
}) {
  if (occurrence.sport === "strength") return null;
  const sport = occurrence.sport;
  const logged = occurrence.resolution.kind === "logged";
  const skipped = occurrence.disposition === "skipped";
  const target = enduranceTarget(occurrence.prescription);
  const note = enduranceNote(occurrence.prescription);
  const name = enduranceName(sport);
  const time = occurrence.scheduledLocalTime ? occurrence.scheduledLocalTime.slice(0, 5) : null;
  // What the Log button adds to its words, so two runs on one day are told apart.
  const said = [
    target
      ? `${target.figure} ${target.unit}`
      : occurrence.prescription
        ? describePrescription(occurrence.prescription)
        : null,
    time ? `at ${time}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ActivityCard
      mark={
        <Art
          kind="mark"
          sport={MARK[sport]}
          size={22}
          state={logged ? "done" : skipped ? "skipped" : "todo"}
        />
      }
      title={name}
      aside={
        target ? (
          <span className="whitespace-nowrap">
            <span className="type-figure">
              <FigureText>{target.figure}</FigureText>
            </span>{" "}
            <span className="type-meta-small font-semibold text-ink-2">{target.unit}</span>
          </span>
        ) : occurrence.prescription ? (
          <span className="type-meta-small text-ink-2">
            {describePrescription(occurrence.prescription)}
          </span>
        ) : null
      }
      muted={logged || skipped}
      facts={
        (note || time || partOf || (occurrence.preparedByCoach && !skipped)) && (
          <>
            {note && <Fact glyph="pace">{note}</Fact>}
            {/* A time of day, on the calendar: the dial is a duration's (70–90 min, 3–4 min). */}
            {time && (
              <Fact glyph="calendar">
                <Figures>{time}</Figures>
              </Fact>
            )}
            {partOf && <Fact glyph="training">Part of {partOf}</Fact>}
            {occurrence.preparedByCoach && !skipped && (
              <Fact glyph="coach">Prepared by the coach</Fact>
            )}
          </>
        )
      }
      status={
        logged ? (
          <p className="activity-card-state">
            <Glyph name="check" className="glyph-18 text-ink" />
            Logged
          </p>
        ) : skipped ? (
          <p className="activity-card-state">
            <Glyph name="skip" className="glyph-18 text-ink" />
            Skipped
          </p>
        ) : null
      }
      details={
        logged ? undefined : (
          <EnduranceDetails occurrence={occurrence} coachSummary={coachSummary} />
        )
      }
      actions={
        logged && occurrence.resolution.kind === "logged" ? (
          <Link
            href={`/training/activities/${occurrence.resolution.activityId}`}
            className="activity-card-link"
          >
            See what you logged
            <Glyph name="chevronRight" className="glyph-18" />
          </Link>
        ) : occurrence.loggable && !skipped ? (
          <LinkButton
            href={`/training/new?occurrence=${occurrence.id}`}
            variant="tonal"
            className="w-full"
            aria-label={said ? `${LOG_LABEL[sport]}: ${said}` : undefined}
          >
            <Glyph name="plus" className="glyph-18" />
            {LOG_LABEL[sport]}
          </LinkButton>
        ) : null
      }
    />
  );
}

/**
 * Still owed an answer and able to take one: what Today puts on the page.
 *
 * `loggable` rather than "not logged", so a session the programme withdrew is not offered
 * with a button that leads to a page explaining it was withdrawn. Work nobody can answer any
 * more is not today's business; it is in the programme, with what became of it.
 */
export function isOutstanding(occurrence: ScheduledOccurrence): boolean {
  return occurrence.loggable;
}

/** Answered by a log. Its card stays on the day it belongs to, inked as done. */
export function isAnswered(occurrence: ScheduledOccurrence): boolean {
  return occurrence.resolution.kind === "logged";
}
