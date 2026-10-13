import type { Route } from "next";
import type { CSSProperties } from "react";

import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Figures } from "@/components/ui/figures";
import { textEmWidth } from "@/components/ui/fit";
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

/** The name a row reads: your own is "You". */
function shownName(row: RankRow, you: string): string {
  return row.key === you ? "You" : row.displayName || row.username;
}

/**
 * Where a board's values go under the names: in every ranked row at once, wherever the row is
 * narrower than the rank, the avatar and their gaps (5.25rem), the board's longest name, a gap
 * and its widest value need side by side.
 * - The name's room is the longest name or handle, at least the 6.25rem a name keeps beside the
 *   avatar and at most 8rem, a first name and a surname of about fifteen letters ("Kenji
 *   Watanabe" is 7.1). A longer name wraps between its words beside the value rather than fold
 *   the board on every phone.
 * - The value's is its widest line, at most a day with its year.
 * Each is its words' own width in the size they are set in (fit.ts), known before the page has
 * measured anything, so a year's "211 h 50 min" beside "Kenji Watanabe" goes under the names on
 * a 360-dp phone and stands beside them from 375 pt, and a period's "15" stands beside them even
 * at 320. The stylesheet compares the row with their sum, as a tray folds (fold.ts): a ranked
 * value's least width is the whole row where the row is narrower, and nothing where it is not.
 */
function foldUnder(
  rows: readonly RankRow[],
  you: string,
  format: (value: number) => string,
  currentYear?: string,
): string {
  const ranked = rows.flatMap((row) => (row.value === null ? [] : [{ row, value: row.value }]));
  // In em of the size each is set in, with a hundredth to spare.
  const widest = (lines: string[], figures = false) =>
    (Math.max(0, ...lines.map((line) => textEmWidth(line, figures))) * 1.01).toFixed(3);
  const name = widest(ranked.map(({ row }) => shownName(row, you)));
  const handle = widest(ranked.map(({ row }) => `@${row.username}`));
  const value = widest(
    ranked.map(({ value }) => format(value)),
    true,
  );
  const under = widest(
    ranked.flatMap(({ row }) => [
      row.detail ?? "",
      row.occurredOn ? formatIsoDate(row.occurredOn, currentYear) : "",
    ]),
    true,
  );
  const room = [
    "var(--spacing) * 24",
    `clamp(6.25rem, max(${name} * var(--ov-type-body), ${handle} * var(--ov-type-meta-small)), 8rem)`,
    `min(max(${value} * var(--ov-type-meta-small), ${under} * var(--ov-type-caption)), 8.75 * var(--ov-type-caption))`,
  ].join(" + ");
  return `min(100%, max(0px, (${room} - 100%) * 9999))`;
}

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
  const fold = foldUnder(rows, you, format, currentYear);
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
                    {shownName(row, you)}
                  </span>
                  <span className="block text-sm [overflow-wrap:break-word] text-ink-muted">
                    @{row.username}
                  </span>
                </span>
              </span>
              {/* Beside the name the value is as wide as its longest line, at most a day with its
                  year (8.75 of the day's em; "Wed 30 Sept 2025" is 8.5), so a day is never broken
                  and a top weight's work breaks only at its dot. Where the row is narrower than
                  the board needs (`foldUnder`), every ranked value is the row's width, under its
                  name. A dash stays beside the name: it takes none of the name's room. */}
              <span
                className={cn(
                  "max-w-[min(100%,calc(var(--ov-type-caption)*8.75))] shrink-0 basis-auto text-right text-sm leading-tight [overflow-wrap:break-word] tabular-nums",
                  !absent && "min-w-(--rank-fold)",
                )}
                style={absent ? undefined : ({ "--rank-fold": fold } as CSSProperties)}
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
