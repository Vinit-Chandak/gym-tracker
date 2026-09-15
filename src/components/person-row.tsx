import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { ChevronRight } from "@/components/ui/icons";
import { ROW_CLASS } from "@/components/ui/link-row";
import { cn } from "@/lib/utils";

export type Person = { username: string; displayName: string | null };

/**
 * One person in a list: avatar, name, handle, and whatever sits at the trailing edge — a
 * follow button, a value, or a chevron. The name is the link to their page; the trailing
 * control stays outside it, so a button never sits inside a link.
 */
export function PersonRow<T extends string>({
  person,
  link = true,
  href,
  children,
  className,
}: {
  person: Person;
  /** Whether the name opens the person's page. */
  link?: boolean;
  /** Somewhere other than the person's page to open: their comparison, say. */
  href?: Route<T>;
  children?: ReactNode;
  className?: string;
}) {
  const name = person.displayName || person.username;
  const body = (
    <>
      <Avatar username={person.username} displayName={person.displayName} size="row" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium [overflow-wrap:anywhere]">{name}</span>
        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
          @{person.username}
        </span>
      </span>
    </>
  );
  return (
    <div className={cn(ROW_CLASS, "gap-3", className)}>
      {link ? (
        <Link
          href={href ?? (`/u/${person.username}` as Route)}
          className="-my-3 -ml-4 flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 pl-4 focus-visible:-outline-offset-2"
        >
          {body}
        </Link>
      ) : (
        body
      )}
      {children ?? (link && <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />)}
    </div>
  );
}
