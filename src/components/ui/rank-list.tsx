import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Figures } from "@/components/ui/figures";
import { List, PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import type { Ranked } from "@/domain/leaderboard";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RankRow = Ranked<{
  key: string;
  username: string;
  displayName: string | null;
  value: number | null;
  /** The day a best was set, under the value; null on a period's totals. */
  occurredOn: string | null;
  /** How a top weight was worked — "4 sets · best 12 reps" — between the value and its day. */
  detail?: string | null;
}>;

/**
 * Leaderboard rows (plan §3.12): rank, avatar, name, value. Your own row reads "You" and is
 * tinted; a row with nothing to rank trails, greyed, with "—", so a friend's absence is
 * visible rather than mysterious. Each row opens the person's page. Server-renderable, so a
 * board costs no JavaScript. The day a best was set reads as the exercise page reads it, its
 * year only outside `currentYear` (ADR 0044).
 */
export function RankList({
  rows,
  you,
  format,
  currentYear,
  className,
}: {
  rows: readonly RankRow[];
  /** The viewer's key: their row is the one highlighted. */
  you: string;
  /** How a value reads in the viewer's unit: "88 kg", "12 reps", "1.18×". */
  format: (value: number) => string;
  /** The year it is in the viewer's zone, "2026". */
  currentYear?: string;
  className?: string;
}) {
  // A day with its year, or how a top weight was worked, is the widest a value gets: such a
  // board needs a wider row before its values can stand beside the names.
  const wide = rows.some(
    (row) => row.detail || (row.occurredOn && row.occurredOn.slice(0, 4) !== currentYear),
  );
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
                "@container flex-wrap",
                mine && "bg-accent-soft",
                absent && "text-ink-muted",
              )}
            >
              {/* The rank, the avatar and the name take what the value leaves. The name goes under
                  the avatar before it would have less than 6.25rem beside it, which only large
                  text asks (the value goes under first), and then in every row. */}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                {/* Wide enough for two digits, so names start on one line whatever the rank. */}
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">
                  {row.rank ?? "—"}
                </span>
                <Avatar username={row.username} displayName={row.displayName} size="row" />
                <span className="min-w-0 flex-[1_1_6.25rem]">
                  <span className="block font-medium [overflow-wrap:break-word]">
                    {mine ? "You" : row.displayName || row.username}
                  </span>
                  <span className="block text-sm [overflow-wrap:break-word] text-ink-muted">
                    @{row.username}
                  </span>
                </span>
              </span>
              {/* Beside the name the value is as wide as its longest line, at most a day with its
                  year (8.75 of the day's em; "Wed 30 Sept 2025" is 8.5), so a day is never broken
                  and a top weight's work breaks only at its dot. It goes under the name in every
                  row at once, each row asking only its own width, before the name would have
                  less than 6.25rem ("Jordan Reyes") beside the board's widest value: the rank,
                  the avatar and their gaps (5.25rem), the name, a gap, and a value with a year
                  (7.1rem) or without (5.25rem: "Wed 30 Sept", "123,456 kg"). At 100% text, under
                  390 pt with a year and under 360 pt without; at 200%, on every phone. */}
              <span
                className={cn(
                  "max-w-full min-w-0 basis-full text-right text-sm leading-tight [overflow-wrap:break-word] tabular-nums",
                  wide
                    ? "@min-[19.375rem]:max-w-[calc(var(--ov-type-caption)*8.75)] @min-[19.375rem]:shrink-0 @min-[19.375rem]:basis-auto"
                    : "@min-[17.5rem]:max-w-[calc(var(--ov-type-caption)*8.75)] @min-[17.5rem]:shrink-0 @min-[17.5rem]:basis-auto",
                )}
              >
                {row.value === null ? (
                  <span aria-label="No data">—</span>
                ) : (
                  <>
                    <span className="block font-medium">
                      <Figures>{format(row.value)}</Figures>
                    </span>
                    {row.detail && (
                      <span className="block text-xs text-ink-muted">
                        <Figures>{row.detail}</Figures>
                      </span>
                    )}
                    {row.occurredOn && (
                      <span className="block text-xs text-ink-muted">
                        <Figures>{formatIsoDate(row.occurredOn, currentYear)}</Figures>
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
