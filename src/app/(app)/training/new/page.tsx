import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CyclingForm } from "@/components/activities/cycling-form";
import { RunningForm } from "@/components/activities/running-form";
import { SwimmingForm } from "@/components/activities/swimming-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ACTIVITY_SPORT_LABELS,
  isActivitySport,
  isEnduranceSport,
  type EnduranceSport,
} from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { enabledSports, multisportRollout } from "@/lib/multisport-rollout";
import { toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getOccurrence } from "@/server/repositories/occurrences";
import { enabledSportsFor, unitsFor } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "Log an activity" };

/** One value only. A repeated singleton parameter is a mistake, not a choice to resolve. */
function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Logging an activity (plan §3.1).
 *
 * The sport comes from the entry point and is fixed from there. `?occurrence=` logs exactly
 * that scheduled session — never the next unlogged one, never one matched by date — and an
 * occurrence that is missing, foreign, already logged or cancelled is refused rather than
 * swapped for something plausible. With no sport at all, this is the chooser.
 */
export default async function NewActivityPage(props: PageProps<"/training/new">) {
  const search = await props.searchParams;
  const rollout = multisportRollout();
  if (!rollout.canonicalWrites || !rollout.sharedNavigation) notFound();

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
  if (requested && !(isActivitySport(requested) && isEnduranceSport(requested))) notFound();
  if (requested && occurrence && occurrence.sport !== requested) notFound();

  const available = enabledSports(rollout).filter(
    (item): item is EnduranceSport => item !== "strength",
  );
  const sport: EnduranceSport | null = occurrence
    ? (occurrence.sport as EnduranceSport)
    : requested && isActivitySport(requested) && isEnduranceSport(requested)
      ? requested
      : null;
  if (sport && !available.includes(sport)) notFound();

  if (!sport) {
    // The chooser, with the sports this account actually trains offered first (§3.1).
    const preferred = await withUser(getDb(), user.id, (tx) => enabledSportsFor(tx, user.id), {
      readOnly: true,
    });
    const ordered = [...available].sort(
      (a, b) => Number(preferred.includes(b)) - Number(preferred.includes(a)),
    );
    return (
      <>
        <PageHeader title="Log an activity" backHref="/training" />
        <PageContent>
          <Section title="What did you do?">
            <Card>
              {ordered.map((item) => (
                <LinkButton
                  key={item}
                  href={`/training/new?sport=${item}`}
                  variant="secondary"
                  className="w-full"
                >
                  {ACTIVITY_SPORT_LABELS[item]}
                </LinkButton>
              ))}
              <p className="text-sm text-ink-muted">
                Lifting has its own logger, started from Today or from a gym.
              </p>
            </Card>
          </Section>
        </PageContent>
      </>
    );
  }

  const units = await withUser(getDb(), user.id, (tx) => unitsFor(tx, user.id, sport), {
    readOnly: true,
  });
  const target = occurrence?.prescription
    ? {
        title: "The plan asked for",
        lines: [
          describePrescription(occurrence.prescription),
          occurrence.prescription.running?.paceNote,
          occurrence.prescription.running?.symptomStopRule,
          occurrence.prescription.instructions,
        ].filter((line): line is string => Boolean(line)),
      }
    : null;

  // Measurements start blank. Context — the sport, the units, the pool — may preselect;
  // a performance never does (ACTUAL-01).
  const initial: Record<string, string> = {
    startedAt: toDateTimeLocal(new Date(), profile.timeZone),
    distanceUnit: sport === "swimming" ? units.poolUnit : units.distanceUnit,
    poolLengthUnit: units.poolUnit,
    distanceValue: "",
    hours: "",
    minutes: "",
    seconds: "",
    effort: "",
  };
  const shared = {
    action: saveActivityAction.bind(null, null),
    submissionKey: crypto.randomUUID(),
    occurrence: occurrence ? { id: occurrence.id, revisionId: occurrence.revisionId } : null,
    target,
    submitLabel: "Save activity",
  };

  return (
    <>
      <PageHeader title={`Log a ${sportNoun(sport)}`} backHref="/training" />
      <PageContent>
        {sport === "running" && (
          <RunningForm {...shared} initial={{ ...initial, environment: "outdoor" }} />
        )}
        {sport === "cycling" && (
          <CyclingForm
            {...shared}
            initial={{ ...initial, environment: "outdoor", assistance: "unknown" }}
          />
        )}
        {sport === "swimming" && (
          <SwimmingForm
            {...shared}
            initial={{ ...initial, environment: "pool", distanceMethod: "unknown" }}
          />
        )}
      </PageContent>
    </>
  );
}

function sportNoun(sport: EnduranceSport): string {
  return sport === "running" ? "run" : sport === "cycling" ? "ride" : "swim";
}
