import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Scales, Trophy, UserPlus, Users } from "@/components/ui/icons";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { ShortcutGrid, ShortcutTile } from "@/components/ui/shortcut-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { countRequests, listFollowing } from "@/server/repositories/follows";
import { readActivity } from "@/server/repositories/shared-stats";

import { ActivityRow } from "./activity-row";
import { PEOPLE_TABS } from "./people-tabs";

export const metadata: Metadata = { title: "Friends" };

/**
 * Friends (ADR 0027): four one-line tiles — Leaderboard, Compare, Find people and People —
 * then recent activity, the last twenty shared sessions of the people you follow. What grows
 * with the number of people, the lists and the requests, lives behind the People tile, so
 * the activity stays on the first screen however many people there are.
 */
export default async function FriendsPage(props: PageProps<"/profile/friends">) {
  const params = await props.searchParams;
  // The lists used to live here as `?people=`; a link or bookmark to them still lands on them.
  const tab = PEOPLE_TABS.find((t) => t === params.people);
  if (tab) redirect(`/profile/friends/people?people=${tab}`);

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const unit = profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  const today = todayInTimeZone(profile.timeZone);
  const { requests, activity } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [requests, following] = await Promise.all([
        countRequests(tx, user.id),
        listFollowing(tx, user.id),
      ]);
      // Only the people you follow; the policies leave out anyone who stopped sharing.
      const activity = await readActivity(
        tx,
        following.map((person) => person.id),
      );
      return { requests, activity };
    },
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Friends" backHref="/profile" />
      <PageContent>
        <ShortcutGrid label="Friends">
          <li>
            <ShortcutTile href="/profile/friends/leaderboard" icon={Trophy} label="Leaderboard" />
          </li>
          <li>
            <ShortcutTile href="/profile/friends/compare" icon={Scales} label="Compare" />
          </li>
          <li>
            <ShortcutTile href="/profile/friends/find" icon={UserPlus} label="Find people" />
          </li>
          <li>
            <ShortcutTile
              href="/profile/friends/people"
              icon={Users}
              label="People"
              badge={
                requests > 0 && (
                  <Badge tone="accent">
                    {requests} {requests === 1 ? "request" : "requests"}
                  </Badge>
                )
              }
            />
          </li>
        </ShortcutGrid>

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
