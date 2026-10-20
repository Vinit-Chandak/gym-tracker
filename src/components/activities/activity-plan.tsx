import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { PRESCRIBED_EFFORT } from "@/domain/activity-limits";
import {
  durationTargetParts,
  expandSteps,
  prescriptionTotals,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import type { HeartRateZone } from "@/domain/heart-rate";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import { DEFAULT_SPORT_UNITS, formatSportDistance, type SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures } from "@/lib/facts";

import { sessionIntensityLine, structureLines } from "./prescription-lines";

/**
 * What today's endurance session asks for (plan §8.2 item 5).
 *
 * Two things are on screen and they are labelled apart, because conflating them is how a
 * target becomes a measurement. The prescription is what to do; the numbers the athlete
 * enters afterwards are what happened. Nothing here prefills a form, and nothing here is
 * described as a result (ACTUAL-01, AT-STRUCT-08).
 *
 * The card also says, plainly, whether a coach prepared this or whether it is the programme's
 * own approved session. An athlete who can see a plan should be able to see where it came
 * from, and "the coach has not got to this one yet" is a fact worth stating rather than an
 * absence to be papered over.
 */

export const PHASE_LABELS = {
  warmup: "Warm-up",
  work: "Work",
  recovery: "Recovery",
  cooldown: "Cool-down",
} as const;

const ACTION_LABELS = {
  run: "Run",
  walk: "Walk",
  ride: "Ride",
  swim: "Swim",
  rest: "Rest",
} as const;

function minutes(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const whole = ms / 60_000;
  return `${Number.isInteger(whole) ? whole : whole.toFixed(1)} min`;
}

function range(low: number, high: number, format: (value: number) => string): string {
  return low === high ? format(high) : `${format(low)}–${format(high)}`;
}

/**
 * "37–47 min", "20 s": a duration or its range with its unit said once, as the card's figure and
 * every other screen say it. Each end with its own unit ("37 min–47 min") read as two targets.
 */
function durationLine(ms: readonly [number, number]): string {
  const { figure, unit } = durationTargetParts(ms);
  return `${figure}\u00a0${unit}`;
}

/**
 * "Effort 2–3 of 5". A prescribed effort is on the athlete's own five steps since 0034, and it
 * says so, so the target reads against the answer the log form asks for. It said "of 10" after
 * the scale changed, which made an easy 2 read as almost nothing.
 */
function effortLine([low, high]: readonly [number, number]): string {
  // Held whole where a line wraps: never "Effort 2–3 of / 5".
  return holdFigures(`Effort ${range(low, high, String)} of\u00a0${PRESCRIBED_EFFORT.max}`);
}

/** "8 × 50 m · freestyle": one written step, its distance in the athlete's own unit. */
export function stepLine(
  step: ReturnType<typeof expandSteps>[number],
  sport: EndurancePrescription["sport"],
  units: SportUnits,
): string {
  const target =
    step.target.kind === "duration"
      ? durationLine(step.target.ms)
      : formatSportDistance(step.target.metres, sport, units);
  // Held at its dash where the line wraps, as the effort is: never "37–" over "47 min".
  const parts = [ACTION_LABELS[step.action], holdFigures(target)];
  if (step.effort) parts.push(effortLine(step.effort));
  if (step.stroke && step.stroke !== "unspecified") parts.push(step.stroke);
  return parts.join(FACT_SEPARATOR);
}

/** The whole-session targets, which are stated beside the steps rather than derived from them. */
export function sessionLine(prescription: EndurancePrescription, units: SportUnits): string | null {
  const { durationMs, distanceMetres, effort } = prescription.sessionTargets;
  // Each range held at its dash where the line wraps, as the programme's run line holds them
  // (`runSummary`): never "4.7–6.0 mi · 37–" over "47 min".
  const parts = [
    distanceMetres
      ? holdFigures(formatSportDistance(distanceMetres, prescription.sport, units))
      : null,
    durationMs ? holdFigures(durationLine(durationMs)) : null,
    effort ? effortLine(effort) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(FACT_SEPARATOR) : null;
}

export type ActivityPlanProps = {
  sport: ActivitySport;
  /** The prescription in force: the coach's preparation, or the programme's own. */
  prescription: EndurancePrescription | null;
  /** The coach's sentences for today, when a preparation exists. */
  preparation?: { summary: string; note: string } | null;
  /** Said out loud rather than left blank when the coach has not prepared this one. */
  preparedByCoach?: boolean;
  /**
   * Whose plan it is, said beside it. Off for a session of a programme the athlete has moved on
   * from (ADR 0054): it is no longer "Your programme", and the line under it names whose it was.
   */
  showSource?: boolean;
  /** How the athlete reads this sport's distances. */
  units?: SportUnits;
  /** The athlete's heart-rate zones, so a zone target reads in their own beats (ADR 0059). */
  zones?: readonly HeartRateZone[] | null;
};

export function ActivityPlan({
  sport,
  prescription,
  preparation = null,
  preparedByCoach = false,
  showSource = true,
  units = DEFAULT_SPORT_UNITS,
  zones = null,
}: ActivityPlanProps) {
  if (!prescription && !preparation) return null;
  // One line per step and one per repeated block, never one per repetition (ADR 0059).
  const lines = prescription ? structureLines(prescription, units, zones) : [];
  const totals = prescription ? prescriptionTotals(prescription) : null;
  const overall = prescription ? sessionLine(prescription, units) : null;
  const intensity = prescription ? sessionIntensityLine(prescription, units, zones) : null;
  const runType = prescription?.running?.sessionType;

  return (
    <Card>
      {/* Whose plan it is stands beside what it asks for, and goes under it before the words
          beside it would have less than a few words' room (large text), where it ran over them. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-[1_1_8rem]">
          <p className="type-meta-small text-ink-2">
            {ACTIVITY_SPORT_LABELS[sport]}
            {FACT_SEPARATOR}planned
            {runType && `${FACT_SEPARATOR}${RUN_TYPE_LABELS[runType]}`}
          </p>
          {prescription?.title && (
            <h2 className="mt-1 text-lg font-medium [overflow-wrap:break-word]">
              {prescription.title}
            </h2>
          )}
          {overall && <p className="mt-1 text-sm text-ink-muted tabular-nums">{overall}</p>}
          {intensity && <p className="mt-0.5 text-sm text-ink-muted tabular-nums">{intensity}</p>}
        </div>
        {showSource && (
          <Badge tone={preparedByCoach ? "accent" : "neutral"}>
            {preparedByCoach ? "From your coach" : "Your programme"}
          </Badge>
        )}
      </div>

      {preparation?.summary && <p className="mt-3 text-sm">{preparation.summary}</p>}

      {lines.length > 0 && (
        <ol className="plan-structure mt-3">
          {lines.map((line, index) => (
            <li key={index} className="plan-structure-line">
              <span className="plan-structure-lead">{line.lead}</span>
              <span className="min-w-0 tabular-nums">
                {line.text}
                {line.notes.length > 0 && (
                  <span className="text-ink-muted"> — {line.notes.join(" ")}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {totals && totals.prescribedRestMs > 0 && (
        // Named as prescribed rest, not as rest. What is actually rested is not measured, and
        // the gap between elapsed and active time is not evidence of it (AT-LOG-09).
        <p className="mt-2 text-xs text-ink-muted tabular-nums">
          Planned rest between reps: {minutes(totals.prescribedRestMs)}
        </p>
      )}

      {prescription?.running && (
        <div className="mt-3">
          <DetailList
            entries={[
              ["Pace", prescription.running.paceNote],
              ["Progression", prescription.running.progressionNote],
              ["Stop if", prescription.running.symptomStopRule],
              ["Note", prescription.running.note],
            ]}
          />
        </div>
      )}
      {prescription?.instructions && (
        <div className="mt-3">
          <DetailList entries={[["How to run it", prescription.instructions]]} />
        </div>
      )}
      {preparation?.note && <p className="mt-3 text-sm text-ink-muted">{preparation.note}</p>}
      {prescription?.notes && <p className="mt-3 text-sm text-ink-muted">{prescription.notes}</p>}
    </Card>
  );
}
