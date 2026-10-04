import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";

export type PersonCounts = { followers: number; following: number };

/**
 * Who a person is, at the head of their page (ADR 0026; board Profile): the avatar, the name,
 * and under it the handle and the two counts on one line; at the end, the one thing to do about
 * it (Edit profile on your tab); under it, whatever else the screen needs (the follow button on
 * someone else's page). On your own tab the counts open the matching list on the People page;
 * on anyone else's they are plain.
 *
 * Given an `href`, the avatar and the name lead there: on your tab, to the page a follower
 * sees. The counts stay links of their own beside it, never inside it.
 */
export function PersonCard<T extends string>({
  person,
  counts,
  countsLinkToFriends = false,
  href,
  action,
  children,
}: {
  person: { username: string; displayName: string | null };
  counts: PersonCounts;
  countsLinkToFriends?: boolean;
  /** Where the avatar and the name lead, on a screen that is not already there. */
  href?: Route<T>;
  /** A round button at the end of the line: Edit profile. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  const followers = `${counts.followers} ${counts.followers === 1 ? "follower" : "followers"}`;
  const following = `${counts.following} following`;
  const avatar = (
    <Avatar
      username={person.username}
      displayName={person.displayName}
      size="header"
      className="person-card-avatar"
    />
  );
  // The name on a line of its own; the handle starts the next, the counts follow it there.
  const identity = (
    <>
      <span className="person-card-name">{person.displayName || person.username}</span>
      {`@${person.username}`}
    </>
  );
  return (
    <div className="person-card">
      <div className="person-card-head">
        {href ? (
          // The same destination as the name, for a thumb. A keyboard or a screen reader
          // reaches it by the name, so this copy stays out of their way.
          <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <p className="person-card-text">
          {href ? <Link href={href}>{identity}</Link> : identity}
          <span className="tabular-nums">
            {" · "}
            {countsLinkToFriends ? (
              <Link href="/profile/friends/people?people=followers">{followers}</Link>
            ) : (
              followers
            )}
            {" · "}
            {countsLinkToFriends ? (
              <Link href="/profile/friends/people?people=following">{following}</Link>
            ) : (
              following
            )}
          </span>
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}
