import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export type PersonCounts = { followers: number; following: number };

/**
 * The header card: what a friend sees of a person (ADR 0026), and the same card on your own
 * Profile tab. Avatar, name, handle, the two counts, then whatever the screen puts under it:
 * Edit profile on your tab, the follow button on someone else's page. On your own tab the
 * counts open the matching list on the People page; on anyone else's they are plain.
 */
export function PersonCard({
  person,
  counts,
  countsLinkToFriends = false,
  warning,
  children,
}: {
  person: { username: string; displayName: string | null };
  counts: PersonCounts;
  countsLinkToFriends?: boolean;
  /** One line under the handle, in the warning colour: a detail still missing. */
  warning?: string;
  children?: ReactNode;
}) {
  const followers = `${counts.followers} ${counts.followers === 1 ? "follower" : "followers"}`;
  const following = `${counts.following} following`;
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar username={person.username} displayName={person.displayName} size="header" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-medium [overflow-wrap:anywhere]">
            {person.displayName || person.username}
          </p>
          <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">@{person.username}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-muted">
            {countsLinkToFriends ? (
              <>
                <Link
                  href="/profile/friends/people?people=followers"
                  className="underline-offset-2 hover:underline"
                >
                  {followers}
                </Link>
                <Link
                  href="/profile/friends/people?people=following"
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
