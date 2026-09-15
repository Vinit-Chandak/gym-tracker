import type { Metadata } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
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
 * Friends (plan §3.4), in order: requests waiting for an answer, finding people, and the
 * people you follow and who follow you. A box with nothing in it is left out; the search
 * field is the one thing always here, and recent activity — the last twenty shared sessions
 * of the people you follow — is a quiet list at the end. Leaderboard and Compare arrive with
 * the phases that give them something to show.
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
