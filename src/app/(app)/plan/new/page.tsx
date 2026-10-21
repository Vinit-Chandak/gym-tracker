import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { Art } from "@/components/art/art";
import { RunningIntakeForm } from "@/components/coaching/running-intake-form";
import { SportIntakeForm } from "@/components/coaching/sport-intake-form";
import { StrengthCoachIntake } from "@/components/coaching/strength-coach-intake";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ACTIVITY_SPORTS,
  ACTIVITY_SPORT_LABELS,
  isActivitySport,
  type ActivitySport,
} from "@/domain/activity";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { todayInTimeZone } from "@/domain/program-calendar";
import { holdHyphens } from "@/lib/facts";
import { ageOn } from "@/lib/units";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { latestIntake } from "@/server/repositories/coach-intakes";
import { runningSnapshot } from "@/server/repositories/running-coach-context";
import { getActiveProgram } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "New programme" };

const MARK = { strength: "strength", running: "run", cycling: "ride", swimming: "swim" } as const;

/**
 * Where building one by hand starts, already set to run the way it was asked to: the sport's
 * builder, under its programme's page (strength's is a cycle of days, the others' weeks).
 */
function builderHref(sport: ActivitySport, mode: "repeating" | "progressive"): Route {
  return `/plan/${sport}/edit?mode=${mode}` as Route;
}

/**
 * New programme (ADR 0058): a sport, then how it runs. Repeating is the same week or cycle again
 * and again; progressive changes as it builds; or the coach writes it from a few answers. There
 * are no templates for now. A sport that already has a programme says what a new one replaces.
 * With the coach, strength asks its whole set of questions, with plans and reports to attach,
 * running its own, and cycling and swimming the short ones.
 */
export default async function NewProgrammePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireProfiledUser();
  const search = await searchParams;
  const sport = search.sport;
  if (sport !== undefined && (typeof sport !== "string" || !isActivitySport(sport))) notFound();
  const selected = typeof sport === "string" && isActivitySport(sport) ? sport : null;
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const asksCoach = search.method === "coach";
  // Strength's questions read what they need themselves.
  const strengthCoach = selected === "strength" && asksCoach;
  const data =
    selected && !strengthCoach
      ? await withUser(
          getDb(),
          user.id,
          async (tx) => ({
            intake: await latestIntake(tx, user.id, selected, "programme"),
            active: await getActiveProgram(tx, user.id, selected),
            // A runner's logs answer some of the running questions before they are asked.
            running:
              selected === "running" && asksCoach
                ? {
                    snapshot: await runningSnapshot(tx, user.id, today),
                    units: await readSportUnits(tx, user.id),
                  }
                : null,
          }),
          { readOnly: true },
        )
      : null;
  const prefill = selected
    ? coachIntakeSchema.parse({
        programmeSport: selected,
        scope: "programme",
        heightCm: profile.heightCm,
        weightKg: profile.bodyWeightKg,
        ageYears: profile.dateOfBirth ? ageOn(profile.dateOfBirth, today) : null,
      })
    : null;
  return (
    <>
      <PageHeader
        title={
          selected
            ? `New ${ACTIVITY_SPORT_LABELS[selected].toLowerCase()} programme`
            : "New programme"
        }
        // The coach's questions go back to the sport's three ways in, not to the sports.
        backHref={
          (selected ? (asksCoach ? `/plan/new?sport=${selected}` : "/plan/new") : "/plan") as Route
        }
      />
      <PageContent>
        {!selected ? (
          <ul>
            {ACTIVITY_SPORTS.map((item) => (
              <NavRow
                key={item}
                href={`/plan/new?sport=${item}` as Route}
                lead={<Art kind="mark" sport={MARK[item]} size={20} />}
                label={ACTIVITY_SPORT_LABELS[item]}
              />
            ))}
          </ul>
        ) : strengthCoach ? (
          <StrengthCoachIntake />
        ) : asksCoach && data!.running ? (
          <RunningIntakeForm
            initial={data!.intake}
            prefill={prefill!}
            snapshot={data!.running.snapshot}
            unit={data!.running.units.distanceUnit}
            today={today}
          />
        ) : asksCoach ? (
          <SportIntakeForm
            sport={selected}
            scope="programme"
            initial={data!.intake}
            prefill={prefill!}
          />
        ) : (
          <div className="space-y-4">
            <ul>
              <NavRow
                href={builderHref(selected, "repeating")}
                glyph="repeat"
                label="Repeating"
                sub="Same week or cycle, on repeat"
              />
              <NavRow
                href={builderHref(selected, "progressive")}
                glyph="target"
                label="Progressive"
                sub="Builds week by week"
              />
              <NavRow
                href={`/plan/new?sport=${selected}&method=coach` as Route}
                glyph="coach"
                label="With the coach"
                sub="Answer a few questions"
              />
            </ul>
            {data!.active && (
              <p className="text-sm text-ink-2">
                Replaces {holdHyphens(data!.active.name)} when you start it. Your history stays.
              </p>
            )}
          </div>
        )}
      </PageContent>
    </>
  );
}
