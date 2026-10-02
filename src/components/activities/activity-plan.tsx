import { Badge } from "@/components/ui/badge";
import { DetailList } from "@/components/ui/detail-list";
import { Pencil } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
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
 * The block also says, plainly, whether a coach prepared this or whether it is the programme's
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

function range(low: number, high: number, format: (value: number) => string): string {
  return low === high ? format(high) : `${format(low)}–${format(high)}`;
}

/** "8 × 50 m · freestyle": one written step, said the way it was written. */
function stepLine(step: ReturnType<typeof expandSteps>[number]): string {
  const target =
    step.target.kind === "duration"
      ? range(step.target.ms[0], step.target.ms[1], minutes)
      : range(step.target.metres[0], step.target.metres[1], metres);
  const parts = [ACTION_LABELS[step.action], target];
  if (step.effort) parts.push(`Effort ${range(step.effort[0], step.effort[1], String)}`);
  if (step.stroke && step.stroke !== "unspecified") parts.push(step.stroke);
  return parts.join(" · ");
}

/** The whole-session targets, which are stated beside the steps rather than derived from them. */
function sessionLine(prescription: EndurancePrescription): string | null {
  const { durationMs, distanceMetres, effort } = prescription.sessionTargets;
  const parts = [
    distanceMetres ? range(distanceMetres[0], distanceMetres[1], metres) : null,
    durationMs ? range(durationMs[0], durationMs[1], minutes) : null,
    effort ? `Effort ${range(effort[0], effort[1], String)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type ActivityPlanProps = {
  sport: ActivitySport;
  /** The prescription in force: the coach's preparation, or the programme's own. */
  prescription: EndurancePrescription | null;
  /** The coach's sentences for today, when a preparation exists. */
  preparation?: { summary: string; note: string } | null;
  /** Said out loud rather than left blank when the coach has not prepared this one. */
  preparedByCoach?: boolean;
};

export function ActivityPlan({
  sport,
  prescription,
  preparation = null,
  preparedByCoach = false,
}: ActivityPlanProps) {
  if (!prescription && !preparation) return null;
  const steps = prescription ? expandSteps(prescription) : [];
  const totals = prescription ? prescriptionTotals(prescription) : null;
  const overall = prescription ? sessionLine(prescription) : null;

  return (
    <Section title={`${ACTIVITY_SPORT_LABELS[sport]} · planned`}>
      <section className="box space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {prescription?.title ? (
              <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">
                {prescription.title}
              </h2>
            ) : (
              <h2 className="text-lg font-semibold">What to do</h2>
            )}
            {overall && (
              <p className="mt-1 font-data text-sm text-ink-muted tabular-nums">{overall}</p>
            )}
          </div>
          <Badge tone={preparedByCoach ? "accent" : "neutral"}>
            {preparedByCoach ? "From your coach" : "Your programme"}
          </Badge>
        </div>

        {/* The coach's sentence for the session, in the coach's hand. */}
        {preparation?.summary && (
          <p className="flex gap-2 [overflow-wrap:anywhere] text-pen">
            <Pencil className="mt-0.5 shrink-0" aria-hidden />
            <span>{preparation.summary}</span>
          </p>
        )}

        {steps.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-3 pb-1">
              <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
                Steps
              </p>
              <p className="font-data text-sm text-ink-muted tabular-nums">
                {steps.length} {steps.length === 1 ? "step" : "steps"}
              </p>
            </div>
            <ol className="min-w-0 ruled-list">
              {steps.map((step, index) => (
                <li
                  key={`${step.id}-${step.repetition}-${index}`}
                  className="flex min-w-0 items-baseline gap-3 py-2"
                >
                  <span className="w-5 shrink-0 font-data text-sm font-medium text-ink-subtle tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-data font-semibold [overflow-wrap:anywhere] tabular-nums">
                      {stepLine(step)}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {PHASE_LABELS[step.phase]}
                      {step.notes && <span> — {step.notes}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
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
          <DetailList entries={[["How to run it", prescription.instructions]]} />
        )}
        {preparation?.note && (
          <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{preparation.note}</p>
        )}
        {prescription?.notes && (
          <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{prescription.notes}</p>
        )}
      </section>
    </Section>
  );
}
