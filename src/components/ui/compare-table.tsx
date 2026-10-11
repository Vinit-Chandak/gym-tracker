import { compareValues, type Comparison } from "@/domain/compare";
import { cn } from "@/lib/utils";

import { Figures } from "./figures";

/** One side of a comparison: the number, how it reads, and anything said under it. */
export type CompareSide = {
  value: number | null;
  /** The value as the reader should see it — "6,240 kg", "5:25 /km". */
  text: string;
  /** Lines under the value: the day a best was set, "12 reps · 4 sets", "1.18× BW". */
  sub?: readonly string[];
};

export type CompareRow = {
  key: string;
  label: string;
  a: CompareSide;
  b: CompareSide;
  /** For pace: the smaller number leads. */
  lowerIsBetter?: boolean;
};

/**
 * "+20%", "−16.7%", "=" for equal, "—" when the friend's side has nothing to be a share of. A
 * row with a leader says "You lead" or "They lead" in place of that dash.
 */
export function percentLabel(comparison: Comparison): string {
  if (comparison.percent === null) return "—";
  if (comparison.percent === 0) return "=";
  const sign = comparison.percent > 0 ? "+" : "−";
  return `${sign}${Math.abs(comparison.percent)}%`;
}

type Who = { name: string; color: string };

/**
 * Several numbers head to head (plan §3.10–3.11): a table with the two people across the top
 * — "You" first, as on the header card, each marked with the colour the radar and the trend
 * chart give them — and one row per metric, the values side by side and the difference
 * under the metric's name as a percentage from the viewer's side, with an arrow: success
 * when ahead, muted when behind. The leading value is the heavier one; a side with nothing
 * reads muted, and with no percentage to give the lead is said in words ("You lead"), or "—"
 * when neither has anything. A real table, so a screen reader hears whose number each is;
 * server-renderable, so a page of these costs no JavaScript.
 *
 * Where three columns would cut a word or a figure (a 320-pt phone, large text), each metric
 * stacks instead (people.css): its name and difference on a line, then each person's value on
 * a line of its own beside their name. The roles are spelled out, so the table is still read
 * as one when its rows are laid out as blocks.
 */
export function CompareTable({
  names,
  rows,
}: {
  /** The two people, viewer first; the viewer's column is headed "You" all the same. */
  names: [string, string];
  rows: CompareRow[];
}) {
  const you: Who = { name: "You", color: "var(--color-series-1)" };
  const them: Who = { name: names[1], color: "var(--color-series-2)" };
  return (
    <div className="compare-table">
      <table role="table" className="w-full table-fixed border-collapse text-sm">
        {/* Fixed widths, so a long name or a wrapped line never squeezes the metric column to
            one word per line; the two value columns share what is left. */}
        <colgroup>
          <col className="w-[30%]" />
          <col />
          <col />
        </colgroup>
        <thead role="rowgroup">
          <tr role="row" className="text-xs text-ink-muted">
            <th role="columnheader" scope="col" className="sr-only">
              Metric
            </th>
            <WhoHead who={you} title={names[0]} />
            <WhoHead who={them} />
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => {
            const comparison = compareValues(row.a.value, row.b.value, row.lowerIsBetter);
            const ahead = comparison.leader === "a";
            const behind = comparison.leader === "b";
            const lead = ahead ? "You lead" : behind ? "They lead" : null;
            return (
              <tr key={row.key} role="row" className="border-t border-line">
                <th
                  role="rowheader"
                  scope="row"
                  className="compare-metric py-3 pr-3 text-left align-top font-normal"
                >
                  <span className="block font-medium">{row.label}</span>
                  <span
                    className={cn(
                      "block text-xs whitespace-nowrap tabular-nums",
                      ahead ? "text-success" : "text-ink-muted",
                    )}
                  >
                    {ahead && <span aria-hidden>↑ </span>}
                    {behind && <span aria-hidden>↓ </span>}
                    {/* Ahead of nothing there is no percentage: who leads is said in words, not
                        as "↑ —". */}
                    {lead && comparison.percent === null ? (
                      lead
                    ) : (
                      <>
                        {lead && <span className="sr-only">{lead} </span>}
                        <Figures>{percentLabel(comparison)}</Figures>
                      </>
                    )}
                  </span>
                </th>
                <Value side={row.a} leads={ahead} who={you} />
                <Value side={row.b} leads={behind} who={them} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="mr-1.5 inline-block size-2 rounded-full align-middle"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function WhoHead({ who, title }: { who: Who; title?: string }) {
  return (
    <th
      role="columnheader"
      scope="col"
      title={title}
      className="pb-2 pl-3 text-right font-medium [overflow-wrap:break-word]"
    >
      <Dot color={who.color} />
      {who.name}
    </th>
  );
}

function Value({ side, leads, who }: { side: CompareSide; leads: boolean; who: Who }) {
  return (
    <td role="cell" className="compare-value py-3 pl-3 text-right align-top leading-tight">
      {/* Whose value it is, said where the column heads are not drawn (a stacked metric). The
          column head already says it aloud. */}
      <span className="compare-who text-xs text-ink-muted" aria-hidden>
        <Dot color={who.color} />
        {who.name}
      </span>
      <span className="compare-figures tabular-nums">
        <span
          className={cn(
            "block",
            leads ? "font-semibold" : side.value ? "font-medium" : "text-ink-muted",
          )}
        >
          <Figures>{side.text}</Figures>
        </span>
        {side.sub?.map((line) => (
          <span key={line} className="block text-xs text-ink-muted">
            <Figures>{line}</Figures>
          </span>
        ))}
      </span>
    </td>
  );
}
