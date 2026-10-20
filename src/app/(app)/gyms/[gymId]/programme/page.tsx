import { SubmitButton } from "@/components/ui/form";
import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { AvailabilityBadge } from "@/components/availability-badge";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { FACT_SEPARATOR, holdHyphens, joinFacts } from "@/lib/facts";
import { AVAILABILITY_LABELS, exerciseOnMachine, programmeLabel } from "@/lib/labels";
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
      if (r.equipmentInstance) return `On ${holdHyphens(r.equipmentInstance.name)}`;
      // When a basic is confirmed is the gym page's ⓘ (About machines), not each row's.
      return r.basis === "free"
        ? "No equipment needed"
        : `Usually here: ${row.assumedTypes.map((t) => t.name.toLowerCase()).join(", ")}`;
    case "fallback":
      return `Do ${holdHyphens(exerciseOnMachine(row.resolvedExerciseName, r.equipmentInstance?.name))} instead`;
    case "unknown":
      // A custom exercise names no kind of machine, only its own, which is at another gym.
      return row.missingTypes.length === 0
        ? "Its machine is not registered here."
        : `Needs ${row.missingTypes.map((t) => t.name.toLowerCase()).join(" or ")}, not registered here.`;
    case "unavailable":
      // Beside the Unavailable badge, which says the rest.
      return "No fallback fits.";
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

  return (
    <>
      <PageHeader title="Programme fit" backHref={`/gyms/${gym.id}`} />
      <PageContent>
        <Card>
          {/* A finished programme is named as one: its fit is still read, for the next block. */}
          <p className="text-sm text-ink-muted">
            {joinFacts([gym.name, program && programmeLabel(program)])}
          </p>
          {program ? (
            <StatTileRow>
              {(["direct", "fallback", "unknown", "unavailable"] as const).map((status) => (
                <StatTile
                  key={status}
                  label={AVAILABILITY_LABELS[status]}
                  value={summary[status]}
                />
              ))}
            </StatTileRow>
          ) : (
            <p className="text-sm text-ink-muted">No active programme.</p>
          )}
        </Card>

        {rows.map((row) => (
          <Card key={row.exercise.id} className="space-y-3">
            {/* The badge stands at the row's top right, the name wrapping beside it, and goes
                under the name only when the name would have less than a few words' room (large
                text): a long name no longer drops it under the days. */}
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-[1_1_8rem]">
                <Link
                  href={`/exercises/${row.exercise.id}`}
                  className="flex min-h-[var(--ov-target)] flex-col justify-center"
                >
                  {/* A name breaks between its words, never at a short compound's hyphen:
                      "Neutral-grip lat pulldown (D-handles)", not "(D-" over "handles)". */}
                  <span className="font-medium [overflow-wrap:break-word]">
                    {holdHyphens(row.exercise.name)}
                  </span>
                  <span className="text-xs [overflow-wrap:break-word] text-ink-muted">
                    {row.days.join(FACT_SEPARATOR)}
                  </span>
                </Link>
              </div>
              <AvailabilityBadge status={row.resolution.status} />
            </div>
            <p className="text-sm text-ink-muted">{detail(row)}</p>

            {/* What nobody has answered for, and a basic taken for granted, can both be said
                to be missing here (ADR 0041). */}
            {(row.missingTypes.length > 0 || row.assumedTypes.length > 0) && (
              <div className="grid gap-2">
                {[...row.missingTypes, ...row.assumedTypes].map((type) => (
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
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control bg-surface-raised px-3 py-2 text-sm"
              >
                {/* Wraps rather than cutting the name off: Remove moves under it when it must. */}
                <span className="min-w-0 [overflow-wrap:break-word]">
                  Fallback here:{" "}
                  {holdHyphens(
                    exerciseOnMachine(fallback.fallbackExerciseName, fallback.fallbackInstanceName),
                  )}
                </span>
                <form action={removeGymFallbackAction.bind(null, gym.id, fallback.id)}>
                  <SubmitButton variant="ghost" size="sm">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            ))}

            {(row.resolution.status !== "direct" || row.resolution.basis === "assumed") && (
              <LinkButton
                href={`/gyms/${gym.id}/programme/${row.exercise.id}/fallback`}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                {/* A row already done as a fallback, or holding one for this gym, gets another. */}
                {row.resolution.status === "fallback" || row.gymFallbacks.length > 0
                  ? "Add another fallback"
                  : "Add a fallback"}
              </LinkButton>
            )}
          </Card>
        ))}
      </PageContent>
    </>
  );
}
