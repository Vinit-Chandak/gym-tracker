import type { Metadata } from "next";

import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { List } from "@/components/ui/link-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { getTodayPlan, listExercisesByDay } from "@/server/repositories/schedule";
import { CalendarDays } from "@/components/ui/icons";

import { StartPlannedButton } from "../plan-actions";

export const metadata: Metadata = { title: "Choose a day" };

export default async function ChooseDayPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const { plan, defaultGymId, exercisesByDay } = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const [plan, gyms] = await Promise.all([
      getTodayPlan(tx, user.id, profile.timeZone),
      listGyms(tx, user.id),
    ]);
    const exercisesByDay = await listExercisesByDay(
      tx,
      (plan?.cycleDays ?? []).filter(({ day }) => day.includesLifting).map(({ day }) => day.id),
    );
    return {
      plan,
      exercisesByDay,
      defaultGymId: gyms.find((g) => g.isActive && g.isDefault)?.id ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Choose a day"
        meta={
          plan ? `Cycle ${plan.cycleDays[0]?.cycleIndex ?? 1} of ${plan.program.weeks}` : undefined
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
        ) : (
          <>
            <List>
              {plan.cycleDays.map(({ day, status }) => {
                const exercises = exercisesByDay.get(day.id) ?? [];
                return (
                  <li key={day.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium [overflow-wrap:anywhere]">{day.name}</p>
                        {day.focus && <p className="text-sm text-ink-muted">{day.focus}</p>}
                      </div>
                      {/* Every day starts out pending, so only a changed status earns a badge. */}
                      {status !== "pending" && (
                        <Badge tone={status === "completed" ? "success" : "warning"}>
                          {SLOT_STATUS_LABELS[status]}
                        </Badge>
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
                        <StartPlannedButton
                          gymId={defaultGymId}
                          programDayId={day.id}
                          dayIndex={day.dayIndex}
                          label="Start"
                          dayName={day.name}
                          // One calm button per row: seven primary buttons make none primary.
                          variant="secondary"
                        />
                      </>
                    ) : (
                      <p className="text-sm text-ink-subtle">Rest day</p>
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
