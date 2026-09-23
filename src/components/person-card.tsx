import type { Route } from "next";
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
 *
 * Given an `href`, the avatar and the name lead there: on your tab, to the page a follower
 * sees. The counts stay links of their own beside it, never inside it.
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
  /** Where the avatar and the name lead, on a screen that is not already there. */
  href?: Route<T>;
  /** One line under the handle, in the warning colour: a detail still missing. */
  warning?: string;
  children?: ReactNode;
}) {
  const followers = `${counts.followers} ${counts.followers === 1 ? "follower" : "followers"}`;
  const following = `${counts.following} following`;
  const avatar = (
    <Avatar username={person.username} displayName={person.displayName} size="header" />
  );
  const identity = (
    <>
      <p className="text-lg font-medium [overflow-wrap:anywhere]">
        {person.displayName || person.username}
      </p>
      <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">@{person.username}</p>
    </>
  );
  return (
    <Card>
      <div className="flex items-center gap-4">
        {href ? (
          // The same destination as the name, for a thumb. A keyboard or a screen reader
          // reaches it by the name, so this copy stays out of their way.
          <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="-mx-1.5 block rounded-control px-1.5 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
            >
              {identity}
            </Link>
          ) : (
            identity
          )}
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
