import { SportSign } from "@/components/art/sign";
import { ActivityCard } from "@/components/ui/activity-card";
import { LinkButton } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { FigureText } from "@/components/ui/figure-text";
import { Figures } from "@/components/ui/figures";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import type { ActivitySport } from "@/domain/activity";
import { PRESCRIBED_EFFORT } from "@/domain/activity-limits";
import {
  describePrescription,
  durationTargetParts,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import { DEFAULT_SPORT_UNITS, sportDistanceParts, type SportUnits } from "@/lib/distance-units";
import { holdFigures, joinFacts } from "@/lib/facts";
import { ORIGIN_PARAM } from "@/lib/nav";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

import { enduranceTarget, LOG_LABEL, plannedName } from "./endurance-line";
import { sessionIntensityLine, structureLines } from "./prescription-lines";

const MARK: Record<Exclude<ActivitySport, "strength">, "run" | "ride" | "swim"> = {
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/** A fact of a card's meta line, led by its glyph (DESIGN.md, Rows and signs). */
function Fact({ glyph, children }: { glyph: GlyphName; children: React.ReactNode }) {
  return (
    <span className="meta-fact">
      <Glyph name={glyph} className="glyph-16" />
      <span className="min-w-0 [overflow-wrap:break-word]">{children}</span>
    </span>
  );
}

/**
 * The session's targets its card's head does not already say (`head`, "30 min"): "Effort 2–3 of
 * 5" under it, or "4.2–5.0 km · Effort 3–4 of 5" under "26–31 min". Each range is held at its
 * dash and each figure to its unit where the line wraps, as the session's own page writes them.
 */
function unsaidTargets(
  prescription: EndurancePrescription,
  units: SportUnits,
  head: string | null,
): string | null {
  const { distanceMetres, durationMs, effort } = prescription.sessionTargets;
  const said = ({ figure, unit }: { figure: string; unit: string }) => `${figure} ${unit}` === head;
  const distance = distanceMetres
    ? sportDistanceParts(distanceMetres, prescription.sport, units)
    : null;
  const duration = durationMs ? durationTargetParts(durationMs) : null;
  const facts = [
    distance && !said(distance) && `${distance.figure} ${distance.unit}`,
    duration && !said(duration) && `${duration.figure} ${duration.unit}`,
    effort &&
      `Effort ${effort[0] === effort[1] ? effort[1] : `${effort[0]}–${effort[1]}`} of\u00a0${PRESCRIBED_EFFORT.max}`,
  ];
  return joinFacts(facts.map((fact) => fact && holdFigures(fact))) || null;
}

/**
 * The whole of an endurance session, for its card's fold: the targets its head does not already
 * say, the steps as written, how to run it, and the coach's word on it where the coach wrote
 * one, each said here once. Skipping or moving it is the card's second button (plan §7).
 */
function EnduranceDetails({
  occurrence,
  head,
  coachSummary,
  units,
}: {
  occurrence: ScheduledOccurrence;
  /** What the card's head already says it asks for: "30 min". */
  head: string | null;
  coachSummary?: string | null;
  units: SportUnits;
}) {
  const prescription = occurrence.prescription;
  // A line per step and per repeated block, as the session's own page reads it (ADR 0059), each
  // leaving out what the session's own targets above them already say.
  const steps = prescription
    ? structureLines(prescription, units, null, prescription.sessionTargets)
    : [];
  const overall = prescription ? unsaidTargets(prescription, units, head) : null;
  const intensity = prescription ? sessionIntensityLine(prescription, units) : null;
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
      {(overall || intensity || steps.length > 0) && (
        <div className="activity-card-passage">
          {overall && <p className="type-meta font-semibold tabular-nums">{overall}</p>}
          {intensity && <p className="type-meta-small text-ink-2 tabular-nums">{intensity}</p>}
          {steps.length > 0 && (
            <ol className="mt-1 space-y-1">
              {steps.map((line, index) => (
                <li key={index} className="type-meta-small [overflow-wrap:break-word] tabular-nums">
                  <span className="text-ink-2">{line.lead}</span> {line.text}
                  {line.notes.length > 0 && (
                    <span className="text-ink-2"> — {line.notes.join(" ")}</span>
                  )}
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
              <dd className="type-meta [overflow-wrap:break-word]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * A run, a ride or a swim owed today, whatever put it there (plan §2.3), as a card of its own
 * in the workout's style (DESIGN.md, Today): the name and what it asks for, the sport's sign,
 * when, its own Log button with Skip or move beside it, one width each, and the whole session
 * folded under them (how to do it said there, once).
 *
 * Two sources meet here and neither is allowed to pretend to be the other. Work the athlete put
 * on the calendar is here because it is dated today. The programme's own endurance is here
 * because the sequence has reached the day it belongs to, never because its original date
 * happens to be today, which is what showed a run from a day nobody had got to yet (TODAY-01).
 * The caller decides which it is asking for; the card only says so.
 */
export function EnduranceCard({
  occurrence,
  day,
  partOf,
  coachSummary,
  units = DEFAULT_SPORT_UNITS,
  primary = false,
}: {
  /** `preparedByCoach` when the prescription is the coach's preparation for today. */
  occurrence: ScheduledOccurrence & { preparedByCoach?: boolean };
  /**
   * The programme day it is the whole of, on a day that only runs: the card takes the day's name
   * and its focus ("Tempo run", "Threshold"), as a lifting day's card does, rather than the
   * sport's bare "Run" that Training and the programme never call it.
   */
  day?: { name: string; focus: string | null } | null;
  /** The programme day it belongs to, when that is not obvious ("Part of Easy Run + Arms"). */
  partOf?: string | null;
  /** The coach's own words for this sport, on the day it planned. */
  coachSummary?: string | null;
  /** How the athlete reads this sport's distances; its targets are said in them. */
  units?: SportUnits;
  /** Log is the screen's one filled action: nothing else on Today is owed before it. */
  primary?: boolean;
}) {
  if (occurrence.sport === "strength") return null;
  const sport = occurrence.sport;
  const target = enduranceTarget(occurrence.prescription, units);
  const runType = occurrence.prescription?.running?.sessionType;
  // The session's own name, or the kind of run it is, before the sport's bare "Run" (ADR 0059),
  // as Log and the session's page name it (`plannedName`).
  const name = day?.name ?? plannedName(occurrence.prescription, sport, units);
  const focus =
    day?.focus ?? (runType && name !== RUN_TYPE_LABELS[runType] ? RUN_TYPE_LABELS[runType] : null);
  const time = occurrence.scheduledLocalTime ? occurrence.scheduledLocalTime.slice(0, 5) : null;
  // What the Log button adds to its words, so two runs on one day are told apart.
  const said = [
    target
      ? `${target.figure} ${target.unit}`
      : occurrence.prescription
        ? describePrescription(occurrence.prescription, units)
        : null,
    time ? `at ${time}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ActivityCard
      mark={<SportSign sport={MARK[sport]} size={40} />}
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
            {describePrescription(occurrence.prescription, units)}
          </span>
        ) : null
      }
      facts={
        (focus || time || partOf || occurrence.preparedByCoach) && (
          <>
            {focus && <Fact glyph="target">{holdFigures(focus)}</Fact>}
            {/* A time of day stands without a glyph: the dial is a duration's (70–90 min,
                3–4 min) and the calendar a date's, and a glyph keeps its one meaning. */}
            {time && (
              <span className="meta-fact">
                <Figures>{time}</Figures>
              </span>
            )}
            {partOf && <Fact glyph="training">Part of {partOf}</Fact>}
            {occurrence.preparedByCoach && <Fact glyph="coach">Prepared by the coach</Fact>}
          </>
        )
      }
      detailsLabel="Steps and pace"
      details={
        <EnduranceDetails
          occurrence={occurrence}
          head={target ? `${target.figure} ${target.unit}` : null}
          coachSummary={coachSummary}
          units={units}
        />
      }
      actions={
        // Peers, one width each, the next step first (DESIGN.md, The Equal Actions Rule).
        <div className="action-row">
          <LinkButton
            href={`/today/log/new?occurrence=${occurrence.id}&${ORIGIN_PARAM}=today`}
            variant={primary ? "primary" : "tonal"}
            aria-label={said ? `${LOG_LABEL[sport]}: ${said}` : undefined}
          >
            <Glyph name="plus" className="glyph-18" />
            {LOG_LABEL[sport]}
          </LinkButton>
          <LinkButton href={`/plan/sessions/${occurrence.id}`} variant="tonal">
            Skip or move
          </LinkButton>
        </div>
      }
    />
  );
}

/**
 * Still owed an answer and able to take one: what Today gives a card (ADR 0058).
 *
 * `loggable` rather than "not logged", so a session the programme withdrew is not offered
 * with a button that leads to a page explaining it was withdrawn. Work nobody can answer any
 * more is not today's business; it is in the programme, with what became of it. A skipped
 * session is answered for today: it is a row under Done, which opens it to undo the skip.
 */
export function isOutstanding(occurrence: ScheduledOccurrence): boolean {
  return occurrence.loggable && occurrence.disposition !== "skipped";
}
