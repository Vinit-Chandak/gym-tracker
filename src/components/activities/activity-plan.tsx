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
import { DEFAULT_SPORT_UNITS, formatSportDistance, type SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures } from "@/lib/facts";

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
  const parts = [ACTION_LABELS[step.action], target];
  if (step.effort) parts.push(effortLine(step.effort));
  if (step.stroke && step.stroke !== "unspecified") parts.push(step.stroke);
  return parts.join(FACT_SEPARATOR);
}

/** The whole-session targets, which are stated beside the steps rather than derived from them. */
export function sessionLine(prescription: EndurancePrescription, units: SportUnits): string | null {
  const { durationMs, distanceMetres, effort } = prescription.sessionTargets;
  const parts = [
    distanceMetres ? formatSportDistance(distanceMetres, prescription.sport, units) : null,
    durationMs ? durationLine(durationMs) : null,
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
  /** How the athlete reads this sport's distances. */
  units?: SportUnits;
};

export function ActivityPlan({
  sport,
  prescription,
  preparation = null,
  preparedByCoach = false,
  units = DEFAULT_SPORT_UNITS,
}: ActivityPlanProps) {
  if (!prescription && !preparation) return null;
  const steps = prescription ? expandSteps(prescription) : [];
  const totals = prescription ? prescriptionTotals(prescription) : null;
  const overall = prescription ? sessionLine(prescription, units) : null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {ACTIVITY_SPORT_LABELS[sport]}
            {FACT_SEPARATOR}planned
          </p>
          {prescription?.title && (
            <h2 className="mt-1 text-lg font-medium [overflow-wrap:break-word]">
              {prescription.title}
            </h2>
          )}
          {overall && <p className="mt-1 text-sm text-ink-muted tabular-nums">{overall}</p>}
        </div>
        <Badge tone={preparedByCoach ? "accent" : "neutral"}>
          {preparedByCoach ? "From your coach" : "Your programme"}
        </Badge>
      </div>

      {preparation?.summary && <p className="mt-3 text-sm">{preparation.summary}</p>}

      {steps.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {steps.map((step, index) => (
            <li key={`${step.id}-${step.repetition}-${index}`} className="text-sm">
              <span className="text-ink-muted">{PHASE_LABELS[step.phase]}</span>{" "}
              <span className="tabular-nums">{stepLine(step, prescription!.sport, units)}</span>
              {step.notes && <span className="text-ink-muted"> — {step.notes}</span>}
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
