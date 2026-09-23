import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listFollowers, listFollowing, listRequests } from "@/server/repositories/follows";

import { PEOPLE_TABS, type PeopleTab } from "../people-tabs";
import { PeopleLists } from "./people-lists";
import { RequestRow } from "./request-row";

export const metadata: Metadata = { title: "People" };

/**
 * People (ADR 0027): requests waiting for an answer, when there are any, then the people you
 * follow and who follow you behind one two-way control. Everything here grows with the
 * number of people, which is why it is a page of its own and not the top of Friends.
 */
export default async function PeoplePage(props: PageProps<"/profile/friends/people">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const tab: PeopleTab = PEOPLE_TABS.find((t) => t === params.people) ?? "following";
  const { requests, following, followers } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [requests, following, followers] = await Promise.all([
        listRequests(tx, user.id),
        listFollowing(tx, user.id),
        listFollowers(tx, user.id),
      ]);
      return { requests, following, followers };
    },
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="People" backHref="/profile/friends" />
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
        <PeopleLists following={following} followers={followers} initial={tab} />
      </PageContent>
    </>
  );
}
