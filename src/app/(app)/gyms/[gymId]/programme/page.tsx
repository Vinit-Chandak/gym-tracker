import { SubmitButton } from "@/components/ui/form";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardList } from "@/components/ui/icons";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
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

export default async function GymProgrammePage(props: PageProps<"/gyms/[gymId]/programme">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, (tx) => gymAvailability(tx, user.id, gymId), {
    readOnly: true,
  });
  if (!data) notFound();
  const { gym, program, rows, summary } = data;

  // What needs a decision comes first, one card each with its answer; a movement the gym
  // already covers is a row in one list, since there is nothing to do about it.
  const open = rows.filter((row) => row.resolution.status !== "direct" || row.gymFallbacks.length);
  const covered = rows.filter(
    (row) => row.resolution.status === "direct" && row.gymFallbacks.length === 0,
  );

  return (
    <>
      <PageHeader title="Programme fit" meta={gym.name} backHref={`/gyms/${gym.id}`} />
      <PageContent>
        <Card>
          {program ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
                <ClipboardList aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{program.name}</span>
              </p>
              {/* Columns sized in rem, so a larger text size takes fewer of them rather than
                  pushing "Unavailable" past the card's edge. */}
              <StatTileRow className="grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))]">
                {(["direct", "fallback", "unknown", "unavailable"] as const).map((status) => (
                  <StatTile
                    key={status}
                    label={AVAILABILITY_LABELS[status]}
                    value={summary[status]}
                  />
                ))}
              </StatTileRow>
            </>
          ) : (
            <p className="text-sm text-ink-muted">No active programme.</p>
          )}
        </Card>

        {open.length > 0 && (
          <Section title="Needs a decision">
            {open.map((row) => (
              <Card key={row.exercise.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <Link
                    href={`/exercises/${row.exercise.id}`}
                    className="flex min-h-11 min-w-0 flex-col justify-center"
                  >
                    <span className="font-semibold [overflow-wrap:anywhere]">
                      {row.exercise.name}
                    </span>
                    <span className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                      {row.days.join(", ")}
                    </span>
                  </Link>
                  <AvailabilityBadge status={row.resolution.status} />
                </div>
                <p className="text-sm text-ink-muted">{detail(row)}</p>

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
                    className="flex flex-wrap items-center justify-between gap-x-3 rounded-tile bg-surface-raised py-1 pr-1 pl-3 text-sm"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
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
                    Add a fallback
                  </LinkButton>
                )}
              </Card>
            ))}
          </Section>
        )}

        {covered.length > 0 && (
          <Section title="Covered here">
            <List>
              {covered.map((row) => (
                <li key={row.exercise.id}>
                  <LinkRow
                    href={`/exercises/${row.exercise.id}`}
                    prefetch="intent"
                    title={row.exercise.name}
                    subtitle={`${detail(row)}, ${row.days.join(", ")}`}
                  />
                </li>
              ))}
            </List>
          </Section>
        )}
      </PageContent>
    </>
  );
}
