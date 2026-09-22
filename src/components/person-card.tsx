import type { ReactNode } from "react";
import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export type PersonCounts = { followers: number; following: number };

/**
 * The header card: what a friend sees of a person (ADR 0026), and the same card on your own
 * Profile tab. Avatar, name, handle, the two counts, then whatever the screen puts under it:
 * Edit profile on your tab, the follow button on someone else's page. On your own tab the
 * counts open the matching list on the Friends page; on anyone else's they are plain.
 *
 * With `href`, the avatar and the name open that page. The Profile tab passes its own
 * `/u/<handle>`, because "what a follower sees of me" was otherwise reachable only by
 * finding yourself in somebody else's followers. A person's own page passes nothing: a card
 * linking to the page it is already on is a dead tap.
 */
export function PersonCard<T extends string>({
  person,
  counts,
  countsLinkToFriends = false,
  href,
  warning,
  children,
}: {
  person: { username: string; displayName: string | null };
  counts: PersonCounts;
  countsLinkToFriends?: boolean;
  /** Where the avatar and the name go. Omitted where there is nowhere to go. */
  href?: Route<T>;
  /** One line under the handle, in the warning colour: a detail still missing. */
  warning?: string;
  children?: ReactNode;
}) {
  const followers = `${counts.followers} ${counts.followers === 1 ? "follower" : "followers"}`;
  const following = `${counts.following} following`;
  // One link for the pair, so a screen reader is offered the person once and hears their
  // name as its label. The avatar repeats it as a tap target only: it is decorative, and
  // announcing an unnamed second link to the same place says nothing the first did not.
  const identity = (
    <>
      <p className="text-lg font-medium [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-2">
        {person.displayName || person.username}
      </p>
      <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">@{person.username}</p>
    </>
  );
  return (
    <Card>
      <div className="flex items-center gap-4">
        {href ? (
          <Link href={href} aria-hidden tabIndex={-1} className="shrink-0">
            <Avatar username={person.username} displayName={person.displayName} size="header" />
          </Link>
        ) : (
          <Avatar username={person.username} displayName={person.displayName} size="header" />
        )}
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="group block">
              {identity}
            </Link>
          ) : (
            identity
          )}
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-muted">
            {countsLinkToFriends ? (
              <>
                <Link
                  href="/profile/friends?people=followers"
                  className="underline-offset-2 hover:underline"
                >
                  {followers}
                </Link>
                <Link
                  href="/profile/friends?people=following"
                  className="underline-offset-2 hover:underline"
                >
                  {following}
                </Link>
              </>
            ) : (
              <>
                <span>{followers}</span>
                <span>{following}</span>
              </>
            )}
          </p>
          {warning && <p className="mt-1 text-sm text-warning">{warning}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}
