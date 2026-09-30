import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import {
  expandSteps,
  prescriptionTotals,
  type EndurancePrescription,
} from "@/domain/activity-prescription";

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

const PHASE_LABELS = {
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

function metres(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} km` : `${value} m`;
}

/**
 * A dash a line never breaks at, and a space that keeps a figure with its unit or its label,
 * so "effort 1–2" is not left as "effort 1–" over "2".
 */
const DASH = "\u2060–\u2060";
const SPACE = "\u00a0";

/** "20–25 min": both ends in one unit say it once, at the end. */
function range(low: number, high: number, format: (value: number) => string): string {
  if (low === high) return format(high).replace(" ", SPACE);
  const [from, fromUnit] = format(low).split(" ");
  const [to, toUnit] = format(high).split(" ");
  return fromUnit === toUnit
    ? `${from}${DASH}${to}${toUnit ? `${SPACE}${toUnit}` : ""}`
    : `${format(low).replace(" ", SPACE)}${DASH}${format(high).replace(" ", SPACE)}`;
}

/** "Swim 8 × 50 m, effort 3, freestyle": one written step, said the way it was written. */
function stepLine(step: ReturnType<typeof expandSteps>[number]): string {
  const target =
    step.target.kind === "duration"
      ? range(step.target.ms[0], step.target.ms[1], minutes)
      : range(step.target.metres[0], step.target.metres[1], metres);
  const parts = [`${ACTION_LABELS[step.action]} ${target}`];
  if (step.effort) parts.push(`effort${SPACE}${range(step.effort[0], step.effort[1], String)}`);
  if (step.stroke && step.stroke !== "unspecified") parts.push(step.stroke);
  return parts.join(", ");
}

/** The whole-session targets, which are stated beside the steps rather than derived from them. */
function sessionParts(prescription: EndurancePrescription): string[] {
  const { durationMs, distanceMetres, effort } = prescription.sessionTargets;
  return [
    distanceMetres ? range(distanceMetres[0], distanceMetres[1], metres) : null,
    durationMs ? range(durationMs[0], durationMs[1], minutes) : null,
    effort ? `effort${SPACE}${range(effort[0], effort[1], String)}` : null,
  ].filter((part): part is string => part !== null);
}

export type ActivityPlanProps = {
  /** The prescription in force: the coach's preparation, or the programme's own. */
  prescription: EndurancePrescription | null;
  /** The coach's sentences for today, when a preparation exists. */
  preparation?: { summary: string; note: string } | null;
  /** Said out loud rather than left blank when the coach has not prepared this one. */
  preparedByCoach?: boolean;
  /** A session of the programme, rather than one the athlete scheduled on its own. */
  fromProgramme?: boolean;
};

export function ActivityPlan({
  prescription,
  preparation = null,
  preparedByCoach = false,
  fromProgramme = true,
}: ActivityPlanProps) {
  if (!prescription && !preparation) return null;
  const steps = prescription ? expandSteps(prescription) : [];
  const totals = prescription ? prescriptionTotals(prescription) : null;
  const overall = prescription ? sessionParts(prescription) : [];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-headline font-semibold [overflow-wrap:anywhere]">
            {prescription?.title ?? "The plan"}
          </h2>
          {overall.length > 0 && (
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
              {overall.join(", ")}
            </p>
          )}
        </div>
        {(preparedByCoach || fromProgramme) && (
          <Badge tone={preparedByCoach ? "accent" : "neutral"}>
            {preparedByCoach ? "From your coach" : "Your programme"}
          </Badge>
        )}
      </div>

      {preparation?.summary && <p className="text-sm">{preparation.summary}</p>}

      {steps.length > 0 && (
        <ol className="ruled-list">
          {steps.map((step, index) => (
            <li
              key={`${step.id}-${step.repetition}-${index}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"
            >
              <span className="text-ink-muted">{PHASE_LABELS[step.phase]}</span>
              <span className="text-right font-semibold tabular-nums">{stepLine(step)}</span>
              {step.notes && <span className="basis-full text-ink-muted">{step.notes}</span>}
            </li>
          ))}
        </ol>
      )}

      {totals && totals.prescribedRestMs > 0 && (
        // Named as prescribed rest, not as rest. What is actually rested is not measured, and
        // the gap between elapsed and active time is not evidence of it (AT-LOG-09).
        <p className="text-xs text-ink-muted tabular-nums">
          Planned rest between reps: {minutes(totals.prescribedRestMs)}
        </p>
      )}

      {prescription?.running && (
        <DetailList
          entries={[
            ["Pace", prescription.running.paceNote],
            ["Progression", prescription.running.progressionNote],
            ["Stop if", prescription.running.symptomStopRule],
            ["Note", prescription.running.note],
          ]}
        />
      )}
      {prescription?.instructions && (
        <DetailList entries={[["How to do it", prescription.instructions]]} />
      )}
      {preparation?.note && <p className="text-sm text-ink-muted">{preparation.note}</p>}
      {prescription?.notes && <p className="text-sm text-ink-muted">{prescription.notes}</p>}
    </Card>
  );
}
