import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunningForm } from "@/components/activities/running-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { isActivitySport, isEnduranceSport, type EnduranceSport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { enabledSports, multisportRollout } from "@/lib/multisport-rollout";
import { toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getOccurrence } from "@/server/repositories/occurrences";

export const metadata: Metadata = { title: "Log an activity" };

/** One value only. A repeated singleton parameter is a mistake, not a choice to resolve. */
function single(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return null;
}

/**
 * Logging an activity (plan §3.1).
 *
 * The sport comes from the entry point and is fixed from there. `?occurrence=` logs exactly
 * that scheduled session — never the next unlogged one, never one matched by date — and an
 * occurrence that is missing, foreign, already logged or of another sport is refused rather
 * than swapped for something plausible.
 */
export default async function NewActivityPage(props: PageProps<"/training/new">) {
  const search = await props.searchParams;
  const rollout = multisportRollout();
  if (!rollout.canonicalWrites) notFound();

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const occurrenceId = single(search.occurrence);

  const occurrence = occurrenceId
    ? await withUser(getDb(), user.id, (tx) => getOccurrence(tx, user.id, occurrenceId), {
        readOnly: true,
      })
    : null;
  if (occurrenceId && (!occurrence || !occurrence.loggable)) notFound();

  const requested = single(search.sport);
  // The occurrence decides the sport when there is one; otherwise the query does, and an
  // unknown value is refused rather than quietly read as running.
  const sport: EnduranceSport | null = occurrence
    ? (occurrence.sport as EnduranceSport)
    : requested && isActivitySport(requested) && isEnduranceSport(requested)
      ? requested
      : null;
  if (!sport) notFound();
  if (sport !== "running" && !rollout.newSports) notFound();
  if (!enabledSports(rollout).includes(sport)) notFound();
  // Cycling and swimming forms arrive with the rest of the shared surfaces; until then this
  // entry point offers the sport it can actually record.
  if (sport !== "running") notFound();

  const target = occurrence?.prescription
    ? {
        title: "The plan asked for",
        lines: [
          describePrescription(occurrence.prescription),
          occurrence.prescription.running?.paceNote,
          occurrence.prescription.running?.symptomStopRule,
        ].filter((line): line is string => Boolean(line)),
      }
    : null;

  return (
    <>
      <PageHeader title="Log a run" backHref="/training" />
      <PageContent>
        <RunningForm
          action={saveActivityAction.bind(null, null)}
          submissionKey={crypto.randomUUID()}
          occurrence={occurrence ? { id: occurrence.id, revisionId: occurrence.revisionId } : null}
          target={target}
          initial={{
            startedAt: toDateTimeLocal(new Date(), profile.timeZone),
            environment: "outdoor",
            distanceUnit: "km",
            // Measurements start blank. A target is shown beside the form, never inside it.
            distanceValue: "",
            hours: "",
            minutes: "",
            seconds: "",
            effort: "",
          }}
          submitLabel="Save activity"
        />
      </PageContent>
    </>
  );
}
