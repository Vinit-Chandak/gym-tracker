import type { Metadata } from "next";
import { Art } from "@/components/art/art";
import { ProgrammeCardActions } from "@/components/coaching/programme-card-actions";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";
import { FreshAfterSets } from "@/components/fresh-after-sets";
import { LoadingPage } from "@/components/shell/loading-page";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavRow } from "@/components/ui/nav-row";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { programmeCards } from "@/server/repositories/sport-programmes";

export const metadata: Metadata = { title: "Training" };
export const unstable_dynamicStaleTime = 60;
const MARK = { strength: "strength", running: "run", cycling: "ride", swimming: "swim" } as const;

export default async function TrainingPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const seen = await seenSetChanges();
  const today = todayInTimeZone(profile.timeZone);
  const cards = await withUser(
    getDb(),
    user.id,
    (tx) => programmeCards(tx, user.id, profile.timeZone, today),
    { readOnly: true },
  );
  return (
    <FreshAfterSets seen={seen} loading={<LoadingPage title="Training" />}>
      <div className="page-wide">
        <PageHeader title="Training" />
        <div className="page-width space-y-[var(--section-gap)] pb-8">
          <section aria-labelledby="training-log" className="training-log">
            <h2 id="training-log" className="caption-head">
              Log
            </h2>
            <p className="mb-3 text-sm text-ink-2">
              Choose a sport, then today or an earlier date.
            </p>
            <ul className="start-tiles training-log-tiles">
              {ACTIVITY_SPORTS.map((sport) => (
                <li key={sport} className="min-w-0">
                  <Link href={`/training/log?sport=${sport}`} className="start-tile">
                    <Art kind="mark" sport={MARK[sport]} size={22} />
                    <span className="start-tile-word">{ACTIVITY_SPORT_LABELS[sport]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="training-programmes" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="training-programmes" className="caption-head">
                Your programmes
              </h2>
              <LinkButton href="/training/programmes/new" variant="ghost">
                Add programme
              </LinkButton>
            </div>
            {cards.length === 0 && (
              <p className="text-sm text-ink-2">
                Create a programme when you want a plan to follow. You can log training at any time.
              </p>
            )}
            <div className="programme-card-grid">
              {cards.map(({ programme, position, next, completed, total, waiting }) => (
                <Card key={programme.id}>
                  <h3 className="text-lg font-medium [overflow-wrap:break-word]">
                    <Link href={`/training/programmes/${programme.sport}`}>{programme.name}</Link>
                  </h3>
                  <p className="text-sm text-ink-2">
                    {ACTIVITY_SPORT_LABELS[programme.sport]}
                    {position ? ` · ${position}` : ""}
                  </p>
                  <ProgressBar
                    value={completed}
                    max={total || 1}
                    label={`${completed} of ${total} ${programme.sport === "strength" ? "programme days" : "sessions"} complete`}
                  />
                  {next && <p className="text-sm">Next: {next}</p>}
                  {waiting.length > 0 && (
                    <LinkButton
                      href={`/profile/programme/drafts/${waiting[0]!.id}`}
                      variant="secondary"
                    >
                      {waiting[0]!.status === "editing"
                        ? "Continue draft"
                        : "Review proposed changes"}
                    </LinkButton>
                  )}
                  <ProgrammeCardActions id={programme.id} sport={programme.sport} />
                </Card>
              ))}
            </div>
          </section>
          <SavedProgrammeWork allSports />
          <ul>
            <NavRow href="/training/scheduled" glyph="calendar" label="Scheduled by you" />
            <NavRow href="/training/templates" glyph="note" label="Session templates" />
            <NavRow
              href="/training/programmes/new?scope=session"
              glyph="coach"
              label="Create a session with the coach"
            />
          </ul>
        </div>
      </div>
    </FreshAfterSets>
  );
}
