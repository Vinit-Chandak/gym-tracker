import { ActivityPlan } from "@/components/activities/activity-plan";
import { Disclosure } from "@/components/ui/disclosure";
import { describePrescription } from "@/domain/activity-prescription";
import { addDays, isoWeekday } from "@/domain/program-calendar";
import type { ProgrammeEnduranceSession } from "@/domain/programme-sport";
import { plannedVolume, plannedVolumeLine } from "@/domain/planned-volume";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import type { SportUnits } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { formatIsoDate, formatIsoShortDay } from "@/lib/format";
import { WEEKDAY_SHORT } from "@/lib/labels";

/**
 * A run, ride or swim programme read before it starts, week by week (ADR 0059): each week's
 * sessions on the days the chosen start date puts them, what each asks for, and what the week
 * adds up to — the way a running plan is read. Repeated sessions are not folded into one: a
 * build is the point, and week 3's long run is not week 1's.
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
  const year = (startDate ?? "").slice(0, 4);
  return (
    <ol className="space-y-2">
      {Array.from({ length: weeks }, (_, index) => index + 1).map((week) => {
        const inWeek = sessions
          .filter((session) => session.weekIndex === week)
          .sort((a, b) => a.dayOffset - b.dayOffset);
        const volume = plannedVolume(inWeek.map((session) => session.prescription));
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
              defaultOpen={week === 1}
            >
              {inWeek.length === 0 ? (
                <p className="py-2 text-sm text-ink-2">Nothing planned.</p>
              ) : (
                <ul className="space-y-3">
                  {inWeek.map((session) => {
                    const date = startDate ? addDays(startDate, session.dayOffset) : null;
                    const type = session.prescription.running?.sessionType;
                    return (
                      <li key={session.lineageId} className="space-y-1.5">
                        <p className="text-sm font-bold [overflow-wrap:break-word]">
                          {date ? `${WEEKDAY_SHORT[isoWeekday(date)]} · ` : ""}
                          {session.name || (type ? RUN_TYPE_LABELS[type] : "Session")}
                          <span className="font-medium text-ink-2">
                            {" "}
                            · {describePrescription(session.prescription, units)}
                          </span>
                        </p>
                        {date && <p className="sr-only">{formatIsoDate(date, year)}</p>}
                        <ActivityPlan
                          sport={session.prescription.sport}
                          prescription={session.prescription}
                          showSource={false}
                          units={units}
                        />
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
