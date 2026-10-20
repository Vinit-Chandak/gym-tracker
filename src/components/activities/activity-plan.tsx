import { plannedName } from "@/components/activities/endurance-line";
import { StopRule } from "@/components/run-plan";
import { Card } from "@/components/ui/card";
import { CoachNote } from "@/components/ui/coach-note";
import { DetailList } from "@/components/ui/detail-list";
import { Disclosure } from "@/components/ui/disclosure";
import { Glyph } from "@/components/ui/glyphs";
import type { ActivitySport } from "@/domain/activity";
import { PRESCRIBED_EFFORT } from "@/domain/activity-limits";
import {
  durationTargetParts,
  expandSteps,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import type { HeartRateZone } from "@/domain/heart-rate";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import { DEFAULT_SPORT_UNITS, formatSportDistance, type SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures } from "@/lib/facts";

import { alreadySays, sessionIntensityLine, structureLines } from "./prescription-lines";

/**
 * What a planned endurance session asks for (plan §8.2 item 5).
 *
 * Two things are on screen and they are labelled apart, because conflating them is how a
 * target becomes a measurement. The prescription is what to do; the numbers the athlete
 * enters afterwards are what happened. Nothing here prefills a form, and nothing here is
 * described as a result (ACTUAL-01, AT-STRUCT-08).
 *
 * Only what the screen around it does not already say: no sport and no "planned", which its page
 * or its row says, and the kind of run only where its name does not. A coach's preparation is
 * said as news ("Prepared by the coach", its words in the coach's passage); the programme's own
 * session needs no tag. When to stop stays in view; how to do it is a fold (DESIGN.md, The
 * Need-to-Know Rule).
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

/** The whole-session targets, each on its own: distance, duration and effort. */
function sessionParts(prescription: EndurancePrescription, units: SportUnits): string[] {
  const { durationMs, distanceMetres, effort } = prescription.sessionTargets;
  // Each range held at its dash where the line wraps, as the programme's run line holds them
  // (`runSummary`): never "4.7–6.0 mi · 37–" over "47 min".
  return [
    distanceMetres
      ? holdFigures(formatSportDistance(distanceMetres, prescription.sport, units))
      : null,
    durationMs ? holdFigures(durationLine(durationMs)) : null,
    effort ? effortLine(effort) : null,
  ].filter((part): part is string => part !== null);
}

/** The whole-session targets, which are stated beside the steps rather than derived from them. */
export function sessionLine(prescription: EndurancePrescription, units: SportUnits): string | null {
  const parts = sessionParts(prescription, units);
  return parts.length > 0 ? parts.join(FACT_SEPARATOR) : null;
}

export type ActivityPlanProps = {
  sport: ActivitySport;
  /** The prescription in force: the coach's preparation, or the programme's own. */
  prescription: EndurancePrescription | null;
  /** The coach's sentences for today, when a preparation exists. */
  preparation?: { summary: string; note: string } | null;
  /** The coach prepared this one, which is news and is said ("Prepared by the coach"). */
  preparedByCoach?: boolean;
  /**
   * Whether to say who prepared it. Off for a session of a programme the athlete has moved on
   * from (ADR 0054), where the line under it names whose it was.
   */
  showSource?: boolean;
  /** How the athlete reads this sport's distances. */
  units?: SportUnits;
  /** The athlete's heart-rate zones, so a zone target reads in their own beats (ADR 0059). */
  zones?: readonly HeartRateZone[] | null;
  /** False where the page is already headed by the session's name. */
  titled?: boolean;
  /**
   * Inside a row or a fold that already names the session: no card and no title, and how to do
   * it said whole rather than folded again.
   */
  flat?: boolean;
  /**
   * What the screen already says of the session over the plan, its name and its figure, so the
   * plan leaves them out ("Long run 4.5 mi" over "45 min"). When not given, the name every screen
   * gives it (`plannedName`) and its own title.
   */
  said?: string | null;
};

export function ActivityPlan({
  sport,
  prescription,
  preparation = null,
  preparedByCoach = false,
  showSource = true,
  units = DEFAULT_SPORT_UNITS,
  zones = null,
  titled = true,
  flat = false,
  said = null,
}: ActivityPlanProps) {
  if (!prescription && !preparation) return null;
  // One line per step and one per repeated block, never one per repetition (ADR 0059).
  const lines = prescription ? structureLines(prescription, units, zones) : [];
  const heading = said ?? `${plannedName(prescription, sport, units)} ${prescription?.title ?? ""}`;
  const overall = prescription
    ? sessionParts(prescription, units).filter((part) => !alreadySays(heading, part))
    : [];
  const intensity = prescription ? sessionIntensityLine(prescription, units, zones) : null;
  const runType = prescription?.running?.sessionType;
  const kind =
    runType && !alreadySays(heading, RUN_TYPE_LABELS[runType]) ? RUN_TYPE_LABELS[runType] : null;
  const title = titled && !flat ? (prescription?.title ?? null) : null;
  const prepared = showSource && preparedByCoach;
  const stop = prescription?.running?.symptomStopRule ?? null;
  const running = prescription?.running;
  const how =
    prescription?.instructions ||
    running?.paceNote ||
    running?.progressionNote ||
    running?.note ||
    preparation?.note ||
    prescription?.notes ? (
      <div className="space-y-2.5">
        {prescription?.instructions && (
          <p className="text-sm [overflow-wrap:break-word]">{prescription.instructions}</p>
        )}
        <DetailList
          entries={[
            ["Pace", running?.paceNote],
            ["Progression", running?.progressionNote],
            ["Note", running?.note],
          ]}
        />
        {preparation?.note && (
          <p className="text-sm [overflow-wrap:break-word] text-ink-muted">{preparation.note}</p>
        )}
        {prescription?.notes && (
          <p className="text-sm [overflow-wrap:break-word] text-ink-muted">{prescription.notes}</p>
        )}
      </div>
    ) : null;

  const body = (
    <>
      {(kind || title || overall.length > 0 || intensity || prepared) && (
        <div className="min-w-0 space-y-1">
          {kind && <p className="type-meta-small text-ink-2">{kind}</p>}
          {title && <h2 className="text-lg font-medium [overflow-wrap:break-word]">{title}</h2>}
          {overall.length > 0 && (
            <p className="text-sm text-ink-muted tabular-nums">{overall.join(FACT_SEPARATOR)}</p>
          )}
          {intensity && <p className="text-sm text-ink-muted tabular-nums">{intensity}</p>}
          {prepared && (
            <p className="flex items-center gap-1.5 type-meta-small text-ink-2">
              <Glyph name="coach" className="glyph-16 shrink-0" />
              Prepared by the coach
            </p>
          )}
        </div>
      )}

      {/* The coach's words for this session: a passage of the card, not a box in it. */}
      {preparation?.summary && (
        <CoachNote flat small className="border-t border-hair pt-3">
          {preparation.summary}
        </CoachNote>
      )}

      {lines.length > 0 && (
        <ol className="plan-structure">
          {lines.map((line, index) => (
            <li key={index} className="plan-structure-line">
              <span className="plan-structure-lead">{line.lead}</span>
              {/* A block's steps a line each, so a rep and its jog read as two things done. */}
              <span className="plan-structure-parts">
                {line.parts.map((part, partIndex) => (
                  <span key={partIndex} className="block">
                    {part.text}
                    {part.note && <span className="text-ink-muted"> — {part.note}</span>}
                  </span>
                ))}
                {line.rest && <span className="block text-ink-muted">{line.rest}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {stop && <StopRule rule={stop} />}

      {how &&
        (flat ? (
          how
        ) : (
          <Disclosure summary="How to do it" variant="footer">
            {how}
          </Disclosure>
        ))}
    </>
  );

  return flat ? <div className="min-w-0 space-y-3">{body}</div> : <Card>{body}</Card>;
}
