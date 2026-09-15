import type { Metadata, Route } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Scales, Trophy, type AppIcon } from "@/components/ui/icons";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listFollowers, listFollowing, listRequests } from "@/server/repositories/follows";
import { readActivity } from "@/server/repositories/shared-stats";

import { ActivityRow } from "./activity-row";
import { PEOPLE_TABS, PeopleLists, type PeopleTab } from "./people-lists";
import { RequestRow } from "./request-row";

export const metadata: Metadata = { title: "Friends" };

/**
 * One of the two doors at the top of the page: a box that is a link, with the icon drawn as
 * an empty state draws its own, so the pair reads as two destinations and not two rows.
 * Two of these fit a 320px screen side by side, which is why each says one short line.
 */
function EntryCard({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: Route;
  icon: AppIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex box min-w-0 flex-col gap-3 panel-padding transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      <span className="flex size-12 items-center justify-center rounded-card bg-surface-raised text-accent">
        <Icon scale="feature" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-medium [overflow-wrap:anywhere]">{title}</span>
        <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

/**
 * Friends (plan §3.4), in order: Leaderboard and Compare side by side, requests waiting for
 * an answer, finding people, and the people you follow and who follow you. A box with
 * nothing in it is left out; the search field is the one thing always here, and recent
 * activity — the last twenty shared sessions of the people you follow — is a quiet list at
 * the end.
 */
export default async function FriendsPage(props: PageProps<"/profile/friends">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const tab: PeopleTab = PEOPLE_TABS.find((t) => t === params.people) ?? "following";
  const profile = await getRequestProfile(user.id, user.email);
  const unit = profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  const today = todayInTimeZone(profile.timeZone);
  const { requests, following, followers, activity } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [requests, following, followers] = await Promise.all([
        listRequests(tx, user.id),
        listFollowing(tx, user.id),
        listFollowers(tx, user.id),
      ]);
      // Only the people you follow; the policies leave out anyone who stopped sharing.
      const activity = await readActivity(
        tx,
        following.map((person) => person.id),
      );
      return { requests, following, followers, activity };
    },
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Friends" backHref="/profile" />
      <PageContent>
        <div className="grid grid-cols-2 gap-3">
          <EntryCard
            href="/profile/friends/leaderboard"
            icon={Trophy}
            title="Leaderboard"
            subtitle="Ranked among the people you follow"
          />
          <EntryCard
            href="/profile/friends/compare"
            icon={Scales}
            title="Compare"
            subtitle="Head to head with a friend"
          />
        </div>

        {requests.length > 0 && (
          <Section title="Requests">
            <List>
              {requests.map((person) => (
                <li key={person.id}>
                  <RequestRow person={person} />
                </li>
              ))}
            </List>
          </Section>
        )}

        <Card>
          <PeopleSearch />
        </Card>

        {(following.length > 0 || followers.length > 0) && (
          <Section title="People">
            <PeopleLists following={following} followers={followers} initial={tab} />
          </Section>
        )}

        {activity.length > 0 && (
          <Section title="Recent activity">
            <List>
              {activity.map((row) => (
                <li key={row.id}>
                  <ActivityRow row={row} unit={unit} today={today} />
                </li>
              ))}
            </List>
          </Section>
        )}
      </PageContent>
    </>
  );
}
