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
              aria-current={mine ? "true" : undefined}
              className={cn(
                PRESSABLE_ROW_CLASS,
                mine && "bg-accent-soft",
                absent && "text-ink-muted",
              )}
            >
              {/* Wide enough for two digits, so names start on one line whatever the rank. */}
              <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">
                {row.rank ?? "—"}
              </span>
              <Avatar username={row.username} displayName={row.displayName} size="row" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium [overflow-wrap:anywhere]">
                  {mine ? "You" : row.displayName || row.username}
                </span>
                <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
                  @{row.username}
                </span>
              </span>
              {/* A reserved column, so a long name wraps instead of pushing the number off. */}
              <span className="max-w-[40%] shrink-0 text-right text-sm leading-tight tabular-nums">
                {row.value === null ? (
                  <span aria-label="No data">—</span>
                ) : (
                  <>
                    <span className="block font-medium">{format(row.value)}</span>
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
