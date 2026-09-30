import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";

export type PersonCounts = { followers: number; following: number };

/** "12 followers": the figure leads in the display face, the word follows. */
function Count({ value, label, href }: { value: number; label: string; href?: Route }) {
  const content = (
    <>
      <span className="font-display text-display-s">{value}</span>{" "}
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="-mx-1.5 flex min-h-11 items-baseline gap-1.5 rounded-control px-1.5 py-1 tabular-nums transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      {content}
    </Link>
  ) : (
    <span className="flex min-h-11 items-baseline gap-1.5 py-1 tabular-nums">{content}</span>
  );
}

/**
 * A person as a friend meets them (ADR 0026): the avatar with whatever the screen offers
 * beside it — the follow button on someone else's page, Edit profile on your own — then the
 * name in the display face, the handle, and the two counts with their figures leading. It is
 * the top of the screen rather than a card on it, the way your own Profile tab opens, so the
 * two read as the same person seen from either side.
 *
 * Given an `href`, the avatar and the name lead there. With `countsLinkToFriends` the counts
 * open the matching list on the People page; otherwise they are plain. Never a link in a link.
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
  /** The action beside the avatar: the follow button, or Edit profile. */
  children?: ReactNode;
}) {
  const avatar = (
    <Avatar username={person.username} displayName={person.displayName} size="header" />
  );
  const identity = (
    <>
      <span className="block font-display text-display-l font-extrabold [overflow-wrap:anywhere]">
        {person.displayName || person.username}
      </span>
      <span className="mt-1 block text-callout [overflow-wrap:anywhere] text-ink-muted">
        @{person.username}
      </span>
    </>
  );
  return (
    <div className="min-w-0 space-y-4 px-1">
      <div className="flex items-center justify-between gap-3">
        {href ? (
          // The same destination as the name, for a thumb. A keyboard or a screen reader
          // reaches it by the name, so this copy stays out of their way.
          <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        {children && <div className="flex min-w-0 shrink-0 justify-end">{children}</div>}
      </div>
      <div className="min-w-0">
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
        {warning && <p className="mt-1 text-sm text-warning">{warning}</p>}
      </div>
      <div className="flex flex-wrap gap-x-5">
        <Count
          value={counts.followers}
          label={counts.followers === 1 ? "follower" : "followers"}
          href={countsLinkToFriends ? "/profile/friends/people?people=followers" : undefined}
        />
        <Count
          value={counts.following}
          label="following"
          href={countsLinkToFriends ? "/profile/friends/people?people=following" : undefined}
        />
      </div>
    </div>
  );
}
