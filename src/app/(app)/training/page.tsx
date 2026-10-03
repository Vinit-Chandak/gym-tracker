import type { Metadata, Route } from "next";

import { Art } from "@/components/art/art";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, ENDURANCE_SPORTS, type EnduranceSport } from "@/domain/activity";
import { requireUser } from "@/server/auth";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramOverview } from "@/server/repositories/schedule";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { CycleDays, type CycleDayTile } from "./cycle-days";
import { dayStateWord, programmeDayParts } from "./programme-day";

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
 * each day, each opening on what that day asks for; then logging the other sports, the sport
 * asked once, on the tile; then what is scheduled outside the programme, and the templates.
 * What actually happened lives in History; what is scheduled for today lives on Today.
 */
export default async function TrainingPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [overview, preferred, protocols] = await Promise.all([
        getProgramOverview(tx, user.id, profile.timeZone),
        // The sports this account actually trains are offered first, as the chooser did.
        enabledSportsFor(tx, user.id),
        sharedWarmupProtocols(tx),
      ]);
      return { overview, preferred, protocols };
    },
    { readOnly: true },
  );
  const ordered = [...ENDURANCE_SPORTS].sort(
    (a, b) => Number(data.preferred.includes(b)) - Number(data.preferred.includes(a)),
  );
  const drills = new Map(data.protocols.map((protocol) => [protocol.id, protocol.drills.length]));
  const overview = data.overview;
  const days: CycleDayTile[] = (overview?.days ?? []).map((plan) => ({
    id: plan.day.id,
    href: `/training/days/${plan.day.id}` as Route,
    name: plan.day.name,
    said: `Day ${plan.day.dayIndex}, ${plan.day.name}, ${dayStateWord(plan)}`,
    next: plan.isNext,
    parts: programmeDayParts(plan, {
      drills: plan.day.warmupProtocolId ? (drills.get(plan.day.warmupProtocolId) ?? 0) : 0,
    }),
  }));

  return (
    <>
      <PageHeader
        title="Training"
        action={
          <Link href="/training/schedule" aria-label="Schedule an activity" className="icon-button">
            <Glyph name="plus" className="glyph-24" />
          </Link>
        }
      />
      <div className="page-width pb-8">
        {overview && (
          <section aria-labelledby="training-programme" className="mt-1">
            <h2 id="training-programme" className="cycle-head">
              <Link href="/profile/programme" className="cycle-name">
                {overview.program.name}
              </Link>
              <span className="cycle-count">
                Cycle {overview.currentCycle} of {overview.program.weeks}
              </span>
            </h2>
            <CycleDays days={days} label="The cycle’s days" />
          </section>
        )}

        {/* The sport is the first thing logging needs, so it is asked once, here, on the tile. */}
        <section aria-labelledby="training-log" className={overview ? "mt-5" : "mt-2"}>
          <h2 id="training-log" className="caption-head">
            Log
          </h2>
          <ul className="start-tiles">
            {ordered.map((sport) => (
              <li key={sport} className="min-w-0">
                <Link href={`/training/new?sport=${sport}`} className="start-tile">
                  <Art kind="mark" sport={SPORT_MARK[sport]} size={22} />
                  <span className="start-tile-word">{ACTIVITY_SPORT_LABELS[sport]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <ul className="mt-2">
          <NavRow href="/training/scheduled" glyph="calendar" label="Scheduled" />
          <NavRow href="/training/templates" glyph="note" label="Templates" />
        </ul>
      </div>
    </>
  );
}
