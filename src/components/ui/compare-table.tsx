import { compareValues, type Comparison } from "@/domain/compare";
import { cn } from "@/lib/utils";

/** One side of a comparison: the number, how it reads, and anything said under it. */
export type CompareSide = {
  value: number | null;
  /** The value as the reader should see it — "6,240 kg", "5:25 /km". */
  text: string;
  /** Lines under the value: the day a best was set, "4 × 12", "1.18× body weight". */
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

/** "+20%", "−16.7%", "=" for equal, "—" when the friend's side has nothing to be a share of. */
export function percentLabel(comparison: Comparison): string {
  if (comparison.percent === null) return "—";
  if (comparison.percent === 0) return "=";
  const sign = comparison.percent > 0 ? "+" : "−";
  return `${sign}${Math.abs(comparison.percent)}%`;
}

/**
 * Several numbers head to head (plan §3.10–3.11): a table with the two people across the top
 * — "You" first, as on the header card, each marked with the colour the radar and the trend
 * chart give them — and one row per metric, the values side by side and the difference
 * under the metric's name as a percentage from the viewer's side, with an arrow: success
 * when ahead, muted when behind. The leading value is the heavier one; a side with nothing
 * reads muted and the percentage "—". A real table, so a screen reader hears whose number
 * each is; server-renderable, so a page of these costs no JavaScript.
 */
export function CompareTable({
  names,
  rows,
}: {
  /** The two people, viewer first; the viewer's column is headed "You" all the same. */
  names: [string, string];
  rows: CompareRow[];
}) {
  return (
    <table className="w-full table-fixed border-collapse text-sm [overflow-wrap:anywhere]">
      {/* Fixed widths, so a long name or a wrapped line never squeezes the metric column to
          one word per line on a 320 px phone; the two value columns share what is left. */}
      <colgroup>
        <col className="w-[30%]" />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr className="text-xs text-ink-muted">
          <th scope="col" className="sr-only">
            Metric
          </th>
          <Who name="You" title={names[0]} color="var(--color-series-1)" />
          <Who name={names[1]} color="var(--color-series-2)" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const comparison = compareValues(row.a.value, row.b.value, row.lowerIsBetter);
          const ahead = comparison.leader === "a";
          const behind = comparison.leader === "b";
          return (
            <tr key={row.key} className="border-t border-line">
              <th scope="row" className="py-3 pr-3 text-left align-top font-normal">
                <span className="block font-medium">{row.label}</span>
                <span
                  className={cn(
                    "block text-xs tabular-nums",
                    ahead ? "text-success" : "text-ink-muted",
                  )}
                >
                  {ahead && <span aria-hidden>↑ </span>}
                  {behind && <span aria-hidden>↓ </span>}
                  <span className="sr-only">
                    {ahead ? "You lead " : behind ? "They lead " : ""}
                  </span>
                  {percentLabel(comparison)}
                </span>
              </th>
              <Value side={row.a} leads={ahead} />
              <Value side={row.b} leads={behind} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Who({ name, title, color }: { name: string; title?: string; color: string }) {
  return (
    <th
      scope="col"
      title={title}
      className="pb-2 pl-2 text-right font-medium [overflow-wrap:anywhere]"
    >
      <span
        className="mr-1.5 inline-block size-2 rounded-full align-middle"
        style={{ background: color }}
        aria-hidden
      />
      {name}
    </th>
  );
}

function Value({ side, leads }: { side: CompareSide; leads: boolean }) {
  return (
    <td className="py-3 pl-2 text-right align-top leading-tight tabular-nums">
      <span
        className={cn(
          "block",
          leads ? "font-semibold" : side.value ? "font-medium" : "text-ink-muted",
        )}
      >
        {side.text}
      </span>
      {side.sub?.map((line) => (
        <span key={line} className="block text-xs text-ink-muted">
          {line}
        </span>
      ))}
    </td>
  );
}
