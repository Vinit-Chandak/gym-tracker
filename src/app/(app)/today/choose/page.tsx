import type { Metadata } from "next";

import { isOutstanding, LOG_LABEL } from "@/components/activities/today-activities";
import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { List } from "@/components/ui/link-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { occurrencesForSlot } from "@/server/repositories/occurrences";
import { getSchedule, getTodayPlan, listExercisesByDay } from "@/server/repositories/schedule";
import { CalendarDays } from "@/components/ui/icons";

import { StartPlannedButton } from "../plan-actions";
import { ProgrammeComplete } from "../today-parts";
import { liftingStartOption } from "./start-option";

export const metadata: Metadata = { title: "Choose a day" };

/**
 * Train another day: every day of the cycle Today is on, each with its status and the start
 * that day would get. One workout is open at a time, so while one is, nothing here starts
 * another: its day says it is in progress, and the session strip is the way back to it. A
 * programme with nothing left says so as Today does, rather than listing days with nothing in
 * them to choose.
 */
export default async function ChooseDayPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const [inProgress, { plan, defaultGymId, exercisesByDay, starts, runs }] = await Promise.all([
    // The per-request read the session strip also makes.
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const profile = requestProfile;
        const [schedule, gyms] = await Promise.all([
          getSchedule(tx, user.id),
          listGyms(tx, user.id),
        ]);
        const plan = await getTodayPlan(tx, user.id, profile.timeZone, schedule);
        const [exercisesByDay, runs] = await Promise.all([
          listExercisesByDay(
            tx,
            (plan?.cycleDays ?? [])
              .filter(({ day }) => day.includesLifting)
              .map(({ day }) => day.id),
          ),
          // The endurance of the day Today is offering, found as Today finds it: by its slot.
          plan?.suggestion && plan.suggestedDay?.includesRun
            ? occurrencesForSlot(tx, user.id, {
                familyId: plan.program.familyId,
                cycleDayIndex: plan.suggestedDay.dayIndex,
                cycleIndex: plan.suggestion.slot.cycleIndex,
              })
            : Promise.resolve([]),
        ]);
        return {
          plan,
          exercisesByDay,
          runs,
          starts: new Map(
            (plan?.cycleDays ?? []).map(({ day, cycleIndex }) => [
              day.id,
              schedule ? liftingStartOption(schedule.state, cycleIndex, day.dayIndex) : null,
            ]),
          ),
          defaultGymId: gyms.find((g) => g.isActive && g.isDefault)?.id ?? null,
        };
      },
      { readOnly: true },
    ),
  ]);
  const complete = plan !== null && plan.suggestion === null;
  const openDay = plan?.cycleDays.find(({ day }) => day.id === inProgress?.programDayId)?.day;

  return (
    <>
      <PageHeader
        title="Choose a day"
        meta={
          plan && !complete
            ? `Cycle ${plan.cycleDays[0]?.cycleIndex ?? 1} of ${plan.program.cycles}`
            : undefined
        }
        backHref="/today"
      />
      <PageContent>
        {!plan ? (
          <EmptyState
            icon={CalendarDays}
            title="No active programme"
            description="Adopt a programme and its days appear here, each with its own prescription."
          />
        ) : complete ? (
          <section aria-labelledby="choose-complete">
            <h2 id="choose-complete" className="text-lg font-medium [overflow-wrap:break-word]">
              {plan.program.name}
            </h2>
            <ProgrammeComplete
              days={plan.progress.total}
              finishedOn={plan.finishedOn}
              today={plan.today}
              className="mt-1"
            />
            <LinkButton href="/profile/programme" size="lg" className="mt-4 w-full">
              Plan the next block
            </LinkButton>
          </section>
        ) : (
          <>
            {inProgress && (
              <p className="text-sm [overflow-wrap:break-word] text-ink-muted">
                {openDay ? `${openDay.name} is in progress.` : "A workout is in progress."} Finish
                or discard it to start another day.
              </p>
            )}
            <List>
              {plan.cycleDays.map(({ day, status }) => {
                const exercises = exercisesByDay.get(day.id) ?? [];
                const start = starts.get(day.id);
                const open = day.id === openDay?.id;
                // The day Today is offering, run or lift: Next here as on Training and the
                // programme, and its runs loggable here as they are there.
                const next = day.id === plan.suggestedDay?.id;
                const owed = next ? runs.filter(isOutstanding) : [];
                return (
                  <li key={day.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium [overflow-wrap:break-word]">{day.name}</p>
                        {day.focus && <p className="text-sm text-ink-muted">{day.focus}</p>}
                      </div>
                      {/* Every day starts out pending, so only a changed status earns a badge. */}
                      {open ? (
                        <Badge tone="accent">In progress</Badge>
                      ) : status !== "pending" ? (
                        <Badge tone={status === "completed" ? "success" : "warning"}>
                          {SLOT_STATUS_LABELS[status]}
                        </Badge>
                      ) : (
                        next && <Badge tone="accent">Next</Badge>
                      )}
                    </div>

                    {day.includesLifting ? (
                      <>
                        {exercises.length > 0 && (
                          <Disclosure
                            summary="The plan"
                            meta={planSummary(exercises)}
                            variant="inline"
                            className="border-0"
                          >
                            <PlannedExerciseList exercises={exercises} />
                          </Disclosure>
                        )}
                        {inProgress ? null : start ? (
                          <StartPlannedButton
                            gymId={defaultGymId}
                            programDayId={day.id}
                            dayIndex={day.dayIndex}
                            label={start.label}
                            // Said once: a label that names the day is not named again.
                            dayName={start.label.includes(day.name) ? undefined : day.name}
                            fromCycleIndex={start.cycleIndex}
                            // One calm button per row: seven primary buttons make none primary.
                            variant="secondary"
                          />
                        ) : (
                          <p className="text-sm text-ink-muted">
                            No workouts remaining for this day.
                          </p>
                        )}
                      </>
                    ) : !day.includesRun ? (
                      <p className="text-sm text-ink-subtle">Rest day</p>
                    ) : null}
                    {owed.map((occurrence) =>
                      occurrence.sport === "strength" ? null : (
                        <LinkButton
                          key={occurrence.id}
                          href={`/training/new?occurrence=${occurrence.id}`}
                          variant="secondary"
                          className="w-full"
                          aria-label={`${LOG_LABEL[occurrence.sport]}: ${day.name}`}
                        >
                          {LOG_LABEL[occurrence.sport]}
                        </LinkButton>
                      ),
                    )}
                    {day.includesRun && (
                      <LinkButton
                        href="/training/programme?sport=running"
                        variant="ghost"
                        className="w-full"
                      >
                        View planned runs
                      </LinkButton>
                    )}
                  </li>
                );
              })}
            </List>
          </>
        )}
      </PageContent>
    </>
  );
}
