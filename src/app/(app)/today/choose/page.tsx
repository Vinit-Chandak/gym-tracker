import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { SLOT_STATUS_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { listGyms } from "@/server/repositories/gyms";
import { getTodayPlan } from "@/server/repositories/schedule";

import { StartPlannedButton } from "../plan-actions";

export const metadata: Metadata = { title: "Choose a day" };

export default async function ChooseDayPage() {
  const user = await requireUser();
  const { plan, defaultGymId } = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    const [plan, gyms] = await Promise.all([
      getTodayPlan(tx, user.id, profile.timeZone),
      listGyms(tx, user.id),
    ]);
    return { plan, defaultGymId: gyms.find((g) => g.isActive && g.isDefault)?.id ?? null };
  });

  return (
    <>
      <PageHeader title="Choose a day" backHref="/today" />
      <PageContent>
        {!plan ? (
          <Card>
            <p className="text-sm text-ink-muted">No active programme.</p>
          </Card>
        ) : (
          <>
            <p className="px-1 text-sm text-ink-muted">
              Cycle {plan.cycleDays[0]?.cycleIndex ?? 1} of {plan.program.weeks}. Starting a day
              that is already done starts its next occurrence.
            </p>
            {plan.cycleDays.map(({ day, status }) => (
              <Card key={day.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{day.name}</h2>
                    {day.focus && <p className="text-sm text-ink-muted">{day.focus}</p>}
                  </div>
                  {/* Every day starts out pending, so only a changed status is worth a badge. */}
                  {status !== "pending" && (
                    <Badge tone={status === "completed" ? "success" : "warning"}>
                      {SLOT_STATUS_LABELS[status]}
                    </Badge>
                  )}
                </div>
                {day.includesLifting ? (
                  <StartPlannedButton
                    gymId={defaultGymId}
                    programDayId={day.id}
                    dayIndex={day.dayIndex}
                    label="Start"
                    ariaLabel={`Start ${day.name}`}
                    // One calm button per card: seven primary buttons make none of them primary.
                    variant="secondary"
                  />
                ) : (
                  <p className="text-sm text-ink-subtle">
                    Rest day — nothing to start. Log a run or recovery instead.
                  </p>
                )}
              </Card>
            ))}
          </>
        )}
      </PageContent>
    </>
  );
}
