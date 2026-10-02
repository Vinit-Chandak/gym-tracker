import { SubmitButton } from "@/components/ui/form";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
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
      return `Needs ${row.missingTypes.map((t) => t.name.toLowerCase()).join(" or ")}: register it, or mark it as not here.`;
    case "unavailable":
      return "Not available here, and no fallback fits.";
  }
}

/**
 * How every exercise of the active programme resolves at this gym, one ruled row each: the
 * exercise and the days that plan it, its standing as a badge, the sentence that explains
 * the standing, and the ways of changing it. Nothing here takes the highlighter: each row's
 * actions are small corrections to the gym's record, and none of them is what the page is for.
 */
export default async function GymProgrammePage(props: PageProps<"/gyms/[gymId]/programme">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, (tx) => gymAvailability(tx, user.id, gymId), {
    readOnly: true,
  });
  if (!data) notFound();
  const { gym, program, rows, summary } = data;

  return (
    <>
      <PageHeader title="Programme fit" meta={gym.name} backHref={`/gyms/${gym.id}`} />
      <PageContent>
        <section className="box space-y-4 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">
              {program ? program.name : "No active programme."}
            </h2>
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
              {program ? `At ${gym.name}` : gym.name}
            </p>
          </div>
          {program && (
            <StatTileRow>
              {(["direct", "fallback", "unknown", "unavailable"] as const).map((status) => (
                <StatTile
                  key={status}
                  label={AVAILABILITY_LABELS[status]}
                  value={summary[status]}
                />
              ))}
            </StatTileRow>
          )}
        </section>

        {rows.length > 0 && (
          <ul className="box-rows">
            {rows.map((row) => (
              <li key={row.exercise.id} className="space-y-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/exercises/${row.exercise.id}`}
                    prefetch="intent"
                    transitionTypes={["nav-forward"]}
                    className="flex min-h-11 min-w-0 flex-col justify-center"
                  >
                    <span className="font-medium [overflow-wrap:anywhere]">
                      {row.exercise.name}
                    </span>
                    <span className="text-xs [overflow-wrap:anywhere] text-ink-muted">
                      {row.days.join(" · ")}
                    </span>
                  </Link>
                  <span className="shrink-0 pt-2.5">
                    <AvailabilityBadge status={row.resolution.status} />
                  </span>
                </div>
                <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{detail(row)}</p>

                {row.resolution.status === "unknown" && (
                  <div className="grid gap-2">
                    {row.missingTypes.map((type) => (
                      <form
                        key={type.id}
                        className="min-w-0"
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
                    className="flex items-center justify-between gap-3 rounded-control bg-surface-raised px-3 py-1 text-sm"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      Fallback here: {fallback.fallbackExerciseName}
                      {fallback.fallbackInstanceName ? ` on ${fallback.fallbackInstanceName}` : ""}
                    </span>
                    <form
                      className="shrink-0"
                      action={removeGymFallbackAction.bind(null, gym.id, fallback.id)}
                    >
                      <SubmitButton variant="ghost" size="sm" className="w-auto">
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
                    Add a fallback
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageContent>
    </>
  );
}
