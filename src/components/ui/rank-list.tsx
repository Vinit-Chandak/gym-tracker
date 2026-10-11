import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { List, PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import type { Ranked } from "@/domain/leaderboard";
import { formatIsoDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RankRow = Ranked<{
  key: string;
  username: string;
  displayName: string | null;
  value: number | null;
  /** The day a best was set, under the value; null on a period's totals. */
  occurredOn: string | null;
  /** How a top weight was worked — "4 × 12" — between the value and its day; null otherwise. */
  detail?: string | null;
}>;

/**
 * Leaderboard rows (plan §3.12): rank, avatar, name, value. Your own row reads "You" and is
 * tinted; a row with nothing to rank trails, greyed, with "—", so a friend's absence is
 * visible rather than mysterious. Each row opens the person's page. Server-renderable, so a
 * board costs no JavaScript.
 */
export function RankList({
  rows,
  you,
  format,
  className,
}: {
  rows: readonly RankRow[];
  /** The viewer's key: their row is the one highlighted. */
  you: string;
  /** How a value reads in the viewer's unit: "88 kg", "12 reps", "1.18×". */
  format: (value: number) => string;
  className?: string;
}) {
  return (
    <List className={className}>
      {rows.map((row) => {
        const mine = row.key === you;
        const absent = row.value === null;
        return (
          <li key={row.key}>
            <Link
              href={`/u/${row.username}` as Route}
              prefetch="intent"
              aria-current={mine ? "true" : undefined}
              className={cn(
                PRESSABLE_ROW_CLASS,
                "flex-wrap",
                mine && "bg-accent-soft",
                absent && "text-ink-muted",
              )}
            >
              {/* The person's basis is what the rank, the avatar and 4.25rem of name need side by
                  side (1.5 + 0.75 + 2.25 + 0.75 + 4.25rem), so where the name goes never depends
                  on the value beside it: every row puts it beside the avatar or, at large text,
                  every row puts it under, with the value under that. */}
              <span className="flex min-w-0 flex-[1_1_9.5rem] flex-wrap items-center gap-x-3 gap-y-1">
                {/* Wide enough for two digits, so names start on one line whatever the rank. */}
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">
                  {row.rank ?? "—"}
                </span>
                <Avatar username={row.username} displayName={row.displayName} size="row" />
                <span className="min-w-0 flex-[1_1_4.25rem]">
                  <span className="block font-medium [overflow-wrap:break-word]">
                    {mine ? "You" : row.displayName || row.username}
                  </span>
                  <span className="block text-sm [overflow-wrap:break-word] text-ink-muted">
                    @{row.username}
                  </span>
                </span>
              </span>
              {/* Values get their own line when the name and rank need the available width. */}
              <span className="ml-auto max-w-full min-w-0 shrink-0 text-right text-sm leading-tight [overflow-wrap:break-word] tabular-nums">
                {row.value === null ? (
                  <span aria-label="No data">—</span>
                ) : (
                  <>
                    <span className="block font-medium">{format(row.value)}</span>
                    {row.detail && (
                      <span className="block text-xs text-ink-muted">{row.detail}</span>
                    )}
                    {row.occurredOn && (
                      <span className="block text-xs text-ink-muted">
                        {formatIsoDay(row.occurredOn)}
                      </span>
                    )}
                  </>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </List>
  );
}
