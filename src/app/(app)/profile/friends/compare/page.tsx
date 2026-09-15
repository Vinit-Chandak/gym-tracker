import type { Metadata } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PersonRow } from "@/components/person-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Scales } from "@/components/ui/icons";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listFollowing } from "@/server/repositories/follows";

export const metadata: Metadata = { title: "Compare" };

/**
 * Pick who to compare with (plan §3.4): the people you follow, each row opening the head to
 * head. With nobody followed, the way out is the search field, already focused.
 */
export default async function ComparePickPage() {
  const user = await requireUser();
  const following = await withUser(getDb(), user.id, (tx) => listFollowing(tx, user.id), {
    readOnly: true,
  });

  return (
    <>
      <PageHeader title="Compare" backHref="/profile/friends" />
      <PageContent>
        {following.length > 0 ? (
          <Section title="Compare with">
            <List>
              {following.map((person) => (
                <li key={person.id}>
                  <PersonRow person={person} href={`/u/${person.username}/compare`} />
                </li>
              ))}
            </List>
          </Section>
        ) : (
          <>
            <Card>
              <EmptyState
                icon={Scales}
                title="Follow someone to compare"
                description="A comparison is between you and a person you follow who shares their training."
              />
            </Card>
            <Card>
              <PeopleSearch autoFocus />
            </Card>
          </>
        )}
      </PageContent>
    </>
  );
}
