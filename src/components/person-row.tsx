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
 *
 * At large text a control goes under the name, at the row's end, rather than squeeze the name
 * to a letter a line: the avatar and the name keep 10rem between them, growing with the text,
 * and the row folds when the control cannot have the rest. A chevron never folds, so beside one
 * the name goes under the avatar once its longest word would not fit beside it ("O'Connor"
 * whole, never "O'Conno / r").
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
      {/* As wide as its longest word, then the rest of the line: the line folds under the
          avatar before a word would break, and a word wider than the row still breaks. */}
      <span className="w-min max-w-full min-w-0 flex-auto">
        <span className="block font-medium [overflow-wrap:break-word]">{name}</span>
        <span className="block text-sm [overflow-wrap:break-word] text-ink-muted">
          @{person.username}
        </span>
      </span>
    </>
  );
  // With a control at the end, the person keeps a basis of their own, so the row folds rather
  // than giving the control the room the name needs.
  const lead = cn(
    "flex min-w-0 flex-wrap items-center gap-3",
    children ? "flex-[1_1_10rem]" : "flex-1",
  );
  return (
    <div className={cn(ROW_CLASS, "gap-3", children && "flex-wrap", className)}>
      {link ? (
        <Link
          href={href ?? (`/u/${person.username}` as Route)}
          prefetch="intent"
          className={cn(lead, "-my-3 -ml-4 min-h-14 py-3 pl-4 focus-visible:-outline-offset-2")}
        >
          {body}
        </Link>
      ) : (
        <span className={lead}>{body}</span>
      )}
      {children ? (
        <span className="ml-auto flex max-w-full shrink-0">{children}</span>
      ) : (
        link && <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
      )}
    </div>
  );
}
