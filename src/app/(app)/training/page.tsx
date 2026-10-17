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
import { Disclosure } from "@/components/ui/disclosure";
import { NavRow } from "@/components/ui/nav-row";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
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
        <PageHeader title="Training" meta="Your programmes, one place to keep them moving." />
        <div className="page-width space-y-[var(--section-gap)] pb-8">
          <section aria-labelledby="training-programmes" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="training-programmes" className="caption-head">
                Active programmes
              </h2>
              <LinkButton href="/training/programmes/new" variant="ghost">
                Add programme
              </LinkButton>
            </div>
            {cards.length === 0 && (
              <Card>
                <h3 className="text-lg font-medium">Make a plan you can return to</h3>
                <p className="text-sm text-ink-2">
                  Build your own programme or create one with the coach. Each sport keeps its own
                  plan.
                </p>
                <LinkButton href="/training/programmes/new">Create your first programme</LinkButton>
              </Card>
            )}
            <div className="programme-card-grid">
              {cards.map(
                ({
                  programme,
                  position,
                  pattern,
                  nextTitle,
                  nextDate,
                  completed,
                  total,
                  waiting,
                  finished,
                }) => (
                  <Card key={programme.id} className="training-programme-card">
                    <div className="flex items-center gap-2 text-sm text-ink-2">
                      <Art kind="mark" sport={MARK[programme.sport]} size={22} />
                      <span>{ACTIVITY_SPORT_LABELS[programme.sport]}</span>
                    </div>
                    <h3 className="text-lg font-medium [overflow-wrap:break-word]">
                      <Link href={`/training/programmes/${programme.sport}`}>{programme.name}</Link>
                    </h3>
                    <p className="text-sm text-ink-2">
                      {position ?? `${programme.weeks ?? 8} weeks`}
                      {pattern && ` · ${pattern}`}
                    </p>
                    <ProgressBar
                      value={completed}
                      max={total || 1}
                      label={`${completed} of ${total} ${programme.sport === "strength" ? "programme days" : "sessions"} complete`}
                    />
                    <div className="training-programme-next">
                      <span className="caption-head">{finished ? "Complete" : "Up next"}</span>
                      <p className="text-sm font-medium">
                        {nextTitle || nextDate
                          ? (nextTitle ?? `${ACTIVITY_SPORT_LABELS[programme.sport]} session`)
                          : finished
                            ? "Ready for your next programme"
                            : "Open your programme to see its sessions"}
                      </p>
                      {nextDate && (
                        <p className="text-sm text-ink-2">
                          {formatIsoDate(nextDate, today.slice(0, 4))}
                        </p>
                      )}
                    </div>
                    {waiting.length > 0 && (
                      <LinkButton
                        href={
                          waiting[0]!.status === "editing"
                            ? programme.sport === "strength"
                              ? `/profile/programme/manual?draft=${waiting[0]!.id}`
                              : `/training/programmes/${programme.sport}/edit?draft=${waiting[0]!.id}`
                            : `/profile/programme/drafts/${waiting[0]!.id}`
                        }
                        variant="secondary"
                      >
                        {waiting[0]!.status === "editing"
                          ? "Continue draft"
                          : "Review proposed changes"}
                      </LinkButton>
                    )}
                    <ProgrammeCardActions
                      id={programme.id}
                      sport={programme.sport}
                      finished={finished}
                    />
                  </Card>
                ),
              )}
            </div>
          </section>
          <section aria-labelledby="training-log" className="training-log">
            <h2 id="training-log" className="caption-head">
              Log a session
            </h2>
            <ul className="start-tiles training-log-tiles">
              {ACTIVITY_SPORTS.map((sport) => (
                <li key={sport} className="min-w-0">
                  <Link
                    href={`/training/log?sport=${sport}`}
                    className="start-tile training-log-shortcut"
                  >
                    <Art kind="mark" sport={MARK[sport]} size={22} />
                    <span className="start-tile-word">{ACTIVITY_SPORT_LABELS[sport]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-ink-2">Follow a planned session or record your own.</p>
          </section>
          <SavedProgrammeWork allSports />
          <Disclosure summary="Session library">
            <ul>
              <NavRow
                href="/training/programmes/archived"
                glyph="table"
                label="Archived programmes"
              />
              <NavRow href="/training/scheduled" glyph="calendar" label="Scheduled by you" />
              <NavRow href="/training/templates" glyph="note" label="Session templates" />
              <NavRow
                href="/training/programmes/new?scope=session"
                glyph="coach"
                label="Create a session with the coach"
              />
            </ul>
          </Disclosure>
        </div>
      </div>
    </FreshAfterSets>
  );
}
