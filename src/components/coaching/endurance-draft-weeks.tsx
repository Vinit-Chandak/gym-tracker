import { enduranceTarget, plannedName } from "@/components/activities/endurance-line";
import { ActivityPlan } from "@/components/activities/activity-plan";
import { alreadySays } from "@/components/activities/prescription-lines";
import { Disclosure } from "@/components/ui/disclosure";
import { addDays, isoWeekday } from "@/domain/program-calendar";
import type { ProgrammeEnduranceSession } from "@/domain/programme-sport";
import { planPace, plannedVolume, plannedVolumeLine } from "@/domain/planned-volume";
import type { SportUnits } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { formatIsoShortDay } from "@/lib/format";
import { WEEKDAY_SHORT } from "@/lib/labels";

/**
 * A run, ride or swim programme read before it starts, week by week (ADR 0059): each week folded
 * under what it adds up to and the day it starts, and in it a row for each session, its name,
 * what it asks for and its day, the way a running plan is read. Each row opens on the session's
 * steps and how to do it. Repeated sessions are not folded into one: a build is the point, and
 * week 3's long run is not week 1's.
 */
export function EnduranceDraftWeeks({
  sessions,
  weeks,
  startDate,
  units,
}: {
  sessions: readonly ProgrammeEnduranceSession[];
  weeks: number;
  /** The start the athlete has chosen so far, which dates every session. */
  startDate: string | null;
  units: SportUnits;
}) {
  // Every week reads its running with no pace of its own at the plan's easiest (ADR 0063).
  const pace = planPace(sessions.map((session) => session.prescription));
  return (
    // A list of folds is ruled rows that share their rules, never a stack of boxes (DESIGN.md).
    <ol className="[&>li+li]:-mt-px">
      {Array.from({ length: weeks }, (_, index) => index + 1).map((week) => {
        const inWeek = sessions
          .filter((session) => session.weekIndex === week)
          .sort((a, b) => a.dayOffset - b.dayOffset);
        const volume = plannedVolume(
          inWeek.map((session) => session.prescription),
          pace,
        );
        const sport = inWeek[0]?.prescription.sport ?? "running";
        const noun = { running: "run", cycling: "ride", swimming: "swim" }[sport];
        return (
          <li key={week}>
            <Disclosure
              summary={`Week ${week}`}
              meta={joinFacts([
                `${inWeek.length} ${noun}${inWeek.length === 1 ? "" : "s"}`,
                plannedVolumeLine(volume, sport, units),
                startDate && formatIsoShortDay(addDays(startDate, (week - 1) * 7)),
              ])}
              variant="inline"
            >
              {inWeek.length === 0 ? (
                <p className="py-2 text-sm text-ink-2">Nothing planned.</p>
              ) : (
                // Ruled rows that share their rules.
                <ul className="[&>li+li]:-mt-px">
                  {inWeek.map((session) => {
                    const date = startDate ? addDays(startDate, session.dayOffset) : null;
                    // Named as the session will be once it is planned (ADR 0059).
                    const name = plannedName(
                      {
                        ...session.prescription,
                        title: session.name || session.prescription.title,
                      },
                      sport,
                      units,
                    );
                    const target = enduranceTarget(session.prescription, units);
                    const figure = target && `${target.figure}\u00a0${target.unit}`;
                    return (
                      <li key={session.lineageId}>
                        <Disclosure
                          summary={name}
                          // The figure once: not again where the name says it ("Long run 4.5 mi").
                          meta={joinFacts([
                            figure && !alreadySays(name, figure) && figure,
                            date && WEEKDAY_SHORT[isoWeekday(date)],
                          ])}
                          variant="inline"
                        >
                          <ActivityPlan
                            sport={session.prescription.sport}
                            prescription={session.prescription}
                            showSource={false}
                            units={units}
                            flat
                            said={joinFacts([name, figure])}
                          />
                        </Disclosure>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Disclosure>
          </li>
        );
      })}
    </ol>
  );
}
