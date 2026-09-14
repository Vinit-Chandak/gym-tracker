import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { PersonCard } from "@/components/person-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { followState } from "@/server/repositories/follows";
import { getDirectoryProfile } from "@/server/repositories/people";
import { requireUsername } from "@/server/validation/params";

export const metadata: Metadata = { title: "Person" };

/**
 * A person as others see them (plan §3.14): the header card with the follow button in place
 * of Edit, or "This is you" on your own. Their training joins the page in the next phase,
 * and only for a follower they share with.
 */
export default async function PersonPage(props: PageProps<"/u/[username]">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const person = await getDirectoryProfile(tx, handle);
      if (!person) return null;
      const relation = person.id === user.id ? null : await followState(tx, user.id, person);
      return { person, relation };
    },
    { readOnly: true },
  );
  if (!found) notFound();
  const { person, relation } = found;

  return (
    <>
      <PageHeader title={person.displayName || person.username} backHref="/profile/friends" />
      <PageContent>
        <PersonCard person={person} counts={person}>
          {relation ? (
            <FollowButton
              personId={person.id}
              username={person.username}
              relation={relation}
              size="md"
              className="[&>button]:w-full"
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">This is you.</p>
              <LinkButton href="/profile/edit" variant="secondary" size="sm">
                Edit profile
              </LinkButton>
            </div>
          )}
        </PersonCard>
      </PageContent>
    </>
  );
}
