import type { Metadata, Route } from "next";

import { ProgrammeComplete } from "@/app/(app)/today/today-parts";
import { Art } from "@/components/art/art";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, ENDURANCE_SPORTS, type EnduranceSport } from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramOverview } from "@/server/repositories/schedule";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { CycleDays, type CycleDayTile } from "./cycle-days";
import { dayStateWord, logSports, programmeDayParts } from "./programme-day";
import { hasTemplateSports } from "./templates/template-sessions";

export const metadata: Metadata = { title: "Training" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

/** Each sport's mark on its tile, the print's form for it. */
const SPORT_MARK: Record<EnduranceSport, "run" | "ride" | "swim"> = {
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/**
 * Where training is entered and managed (plan §2.3; board Training).
 *
 * Not a second history and not a second Today. The programme is here as its cycle, a print for
 * each day, each opening on what that day asks for (the day being trained, on its workout), or
 * once it is finished, Today's word for that and the way to the next block; then logging the
 * other sports this account trains, the sport asked once, on the tile; then what is scheduled
 * outside the programme, and the templates. What actually happened lives in History; what is
 * scheduled for today lives on Today.
 */
export default async function TrainingPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  // The open workout comes from the per-request read the session strip also makes.
  const [inProgress, data] = await Promise.all([
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const [overview, enabled, protocols] = await Promise.all([
          getProgramOverview(tx, user.id, profile.timeZone),
          enabledSportsFor(tx, user.id),
          sharedWarmupProtocols(tx),
        ]);
        return { overview, enabled, protocols };
      },
      { readOnly: true },
    ),
  ]);
  const overview = data.overview;
  const sports = logSports(ENDURANCE_SPORTS, data.enabled, overview?.days ?? []);
  // Scheduling, like templates, is runs, rides and swims: a lifter with none of those on is not
  // offered it (the page still opens for anyone who goes to it).
  const endurance = hasTemplateSports(data.enabled);
  const drills = new Map(data.protocols.map((protocol) => [protocol.id, protocol.drills.length]));
  const days: CycleDayTile[] = (overview?.days ?? []).map((plan) => {
    // The day being trained now opens on its workout, not on what the day asks for.
    const open = inProgress !== null && inProgress.programDayId === plan.day.id;
    return {
      id: plan.day.id,
      href: (open ? `/workouts/${inProgress.id}` : `/training/days/${plan.day.id}`) as Route,
      name: plan.day.name,
      said: `Day ${plan.day.dayIndex}, ${plan.day.name}, ${dayStateWord(plan, open)}`,
      next: plan.isNext,
      word: open ? "In progress" : plan.isNext ? "Next" : null,
      parts: programmeDayParts(plan, {
        drills: plan.day.warmupProtocolId ? (drills.get(plan.day.warmupProtocolId) ?? 0) : 0,
      }),
    };
  });

  return (
    // A screen of tiles: as wide as the size class allows, its header with it (ADR 0052).
    <div className="page-wide">
      <PageHeader
        title="Training"
        action={
          endurance ? (
            <Link
              href="/training/schedule"
              aria-label="Schedule an activity"
              className="icon-button"
            >
              <Glyph name="plus" className="glyph-24" />
            </Link>
          ) : undefined
        }
      />
      <div className="page-width pb-8">
        {overview && (
          <section aria-labelledby="training-programme" className="mt-1">
            <h2 id="training-programme" className="cycle-head">
              <Link href="/profile/programme" className="cycle-name">
                {overview.program.name}
              </Link>
              {!overview.complete && (
                <span className="cycle-count">
                  Cycle {overview.currentCycle} of {overview.program.cycles}
                </span>
              )}
            </h2>
            {/* Finished, it says so as Today does, and its last cycle stays drawn, all in ink. */}
            {overview.complete && (
              <ProgrammeComplete
                days={overview.progress.total}
                finishedOn={overview.finishedOn}
                today={todayInTimeZone(profile.timeZone)}
              />
            )}
            <CycleDays days={days} label="The cycle’s days" />
            {overview.complete && (
              <LinkButton href="/profile/programme" variant="secondary" className="mt-4 w-full">
                Plan the next block
              </LinkButton>
            )}
          </section>
        )}

        {/* The sport is the first thing logging needs, so it is asked once, here, on the tile. */}
        {sports.length > 0 && (
          <section aria-labelledby="training-log" className={overview ? "mt-5" : "mt-2"}>
            <h2 id="training-log" className="caption-head">
              Log
            </h2>
            <ul className="start-tiles">
              {sports.map((sport) => (
                <li key={sport} className="min-w-0">
                  <Link href={`/training/new?sport=${sport}`} className="start-tile">
                    <Art kind="mark" sport={SPORT_MARK[sport]} size={22} />
                    <span className="start-tile-word">{ACTIVITY_SPORT_LABELS[sport]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Under the cycle itself when no sport is there to log, as far down as Log would be.
            Templates are runs, rides and swims: a lifter with none of those on is not led there
            (the page still opens for anyone who goes to it). */}
        <ul className={overview && sports.length === 0 ? "mt-5" : "mt-2"}>
          <NavRow href="/training/scheduled" glyph="calendar" label="Scheduled by you" />
          {endurance && <NavRow href="/training/templates" glyph="note" label="Templates" />}
        </ul>
      </div>
    </div>
  );
}
