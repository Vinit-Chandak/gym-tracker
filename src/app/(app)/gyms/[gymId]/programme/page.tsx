import { SubmitButton } from "@/components/ui/form";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { AVAILABILITY_LABELS } from "@/lib/labels";
import { markEquipmentAbsentAction, removeGymFallbackAction } from "@/server/actions/availability";
import { requireUser } from "@/server/auth";
import { requireUuid } from "@/server/validation/params";
import {
  gymAvailability,
  type PlannedExerciseAvailability,
} from "@/server/repositories/availability";

export const metadata: Metadata = { title: "Programme fit" };

function detail(row: PlannedExerciseAvailability): string {
  const r = row.resolution;
  switch (r.status) {
    case "direct":
      return r.equipmentInstance ? `On ${r.equipmentInstance.name}` : "Free weights or bodyweight";
    case "fallback":
      return `Do ${row.resolvedExerciseName}${r.equipmentInstance ? ` on ${r.equipmentInstance.name}` : ""} instead`;
    case "unknown":
      return `Needs ${row.missingTypes.map((t) => t.name.toLowerCase()).join(" or ")}. Register the machine on this gym, or mark it as not here.`;
    case "unavailable":
      return "Marked as not available here, and no fallback fits.";
  }
}

export default async function GymProgrammePage(props: PageProps<"/gyms/[gymId]/programme">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, (tx) => gymAvailability(tx, user.id, gymId));
  if (!data) notFound();
  const { gym, program, rows, summary } = data;

  return (
    <>
      <PageHeader title="Programme fit" backHref={`/gyms/${gym.id}`} />
      <PageContent>
        <Card>
          <p className="text-sm text-ink-muted">
            {gym.name}
            {program ? ` · ${program.name}` : ""}
          </p>
          {program ? (
            <dl className="grid grid-cols-4 gap-2">
              {(["direct", "fallback", "unknown", "unavailable"] as const).map((status) => (
                <div
                  key={status}
                  className="rounded-control bg-surface-raised px-2 py-2 text-center"
                >
                  <dt className="text-xs text-ink-subtle">{AVAILABILITY_LABELS[status]}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{summary[status]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">
              No active programme. Set up starter data in Settings to load the 8-week plan.
            </p>
          )}
        </Card>

        {rows.map((row) => (
          <Card key={row.exercise.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/exercises/${row.exercise.id}`} className="font-semibold">
                  {row.exercise.name}
                </Link>
                <p className="text-xs text-ink-muted">{row.days.join(" · ")}</p>
              </div>
              <AvailabilityBadge status={row.resolution.status} />
            </div>
            <p className="text-sm text-ink-muted">{detail(row)}</p>

            {row.resolution.status === "unknown" && (
              <div className="flex flex-wrap gap-2">
                {row.missingTypes.map((type) => (
                  <form
                    key={type.id}
                    action={markEquipmentAbsentAction.bind(null, gym.id, type.id)}
                  >
                    <SubmitButton variant="secondary" size="sm">
                      No {type.name.toLowerCase()} here
                    </SubmitButton>
                  </form>
                ))}
              </div>
            )}

            {row.gymFallbacks.map((fallback) => (
              <div
                key={fallback.id}
                className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  Fallback here: {fallback.fallbackExerciseName}
                  {fallback.fallbackInstanceName ? ` on ${fallback.fallbackInstanceName}` : ""}
                </span>
                <form action={removeGymFallbackAction.bind(null, gym.id, fallback.id)}>
                  <SubmitButton variant="ghost" size="sm">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            ))}

            {gym.kind === "gym" && row.resolution.status !== "direct" && (
              <LinkButton
                href={`/gyms/${gym.id}/programme/${row.exercise.id}/fallback`}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Add a fallback for this gym
              </LinkButton>
            )}
          </Card>
        ))}
      </PageContent>
    </>
  );
}
