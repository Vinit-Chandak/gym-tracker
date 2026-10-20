import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import {
  listFollowers,
  listFollowing,
  listRequests,
  listSentRequests,
} from "@/server/repositories/follows";

import { PeopleLists } from "./people-lists";
import { RequestRow, SentRequestRow } from "./request-row";

export const metadata: Metadata = { title: "People" };

/**
 * People (ADR 0027): requests waiting for your answer, and those you sent still waiting for
 * theirs, when there are any, then the people you follow and who follow you behind one two-way
 * control. Everything here grows with the number of people, which is why it is a page of its
 * own and not the top of Friends.
 */
export default async function PeoplePage() {
  const user = await requireUser();
  const { requests, sent, following, followers } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [requests, sent, following, followers] = await Promise.all([
        listRequests(tx, user.id),
        listSentRequests(tx, user.id),
        listFollowing(tx, user.id),
        listFollowers(tx, user.id),
      ]);
      return { requests, sent, following, followers };
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
        {/* Following counts only who accepted: a request still waiting is listed here, where
            it can be withdrawn, rather than nowhere. */}
        {sent.length > 0 && (
          <Section title="Requested" info="Waiting for them to accept.">
            <List>
              {sent.map((person) => (
                <li key={person.id}>
                  <SentRequestRow person={person} />
                </li>
              ))}
            </List>
          </Section>
        )}
        <PeopleLists following={following} followers={followers} />
      </PageContent>
    </>
  );
}
