import { compareValues, type Comparison } from "@/domain/compare";
import { cn } from "@/lib/utils";

/** One side of a bar pair: the number, how it reads, and anything said under it. */
export type BarSide = {
  value: number | null;
  /** The value as the reader should see it — "6,240 kg", "5:25 /km". */
  text: string;
  /** Lines under the value: the day a best was set, "1.18× body weight". */
  sub?: readonly string[];
};

/** "+20%", "−16.7%", "=" for equal, "—" when the friend's side has nothing to be a share of. */
export function percentLabel(comparison: Comparison): string {
  if (comparison.percent === null) return "—";
  if (comparison.percent === 0) return "=";
  const sign = comparison.percent > 0 ? "+" : "−";
  return `${sign}${Math.abs(comparison.percent)}%`;
}

/**
 * One metric head to head (plan §3.10): a pair of horizontal bars scaled to the larger value,
 * the viewer's on top in series 1, the friend's beneath in series 2, values at the bar ends,
 * and the difference as a percentage from the viewer's side with an arrow — success when
 * ahead, muted when behind, as `Headline` already colours its change. A side with nothing
 * draws no bar and its text (the caller's "0") reads muted; the percentage then reads "—".
 * Server-renderable, so a page of these costs no JavaScript.
 */
export function CompareBar({
  label,
  a,
  b,
  lowerIsBetter = false,
  names,
}: {
  label: string;
  a: BarSide;
  b: BarSide;
  lowerIsBetter?: boolean;
  /** The two people, for assistive readers; the colours carry it for everyone else. */
  names: [string, string];
}) {
  const comparison = compareValues(a.value, b.value, lowerIsBetter);
  const max = Math.max(a.value ?? 0, b.value ?? 0);
  const share = (value: number | null) => (max > 0 && value ? (value / max) * 100 : 0);
  const ahead = comparison.leader === "a";
  const behind = comparison.leader === "b";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn("shrink-0 text-sm tabular-nums", ahead ? "text-success" : "text-ink-muted")}
        >
          {ahead && <span aria-hidden>↑ </span>}
          {behind && <span aria-hidden>↓ </span>}
          <span className="sr-only">{ahead ? "You lead " : behind ? "They lead " : ""}</span>
          {percentLabel(comparison)}
        </span>
      </div>
      <Bar side={a} share={share(a.value)} color="var(--color-series-1)" name={names[0]} />
      <Bar side={b} share={share(b.value)} color="var(--color-series-2)" name={names[1]} />
    </div>
  );
}

function Bar({
  side,
  share,
  color,
  name,
}: {
  side: BarSide;
  share: number;
  color: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">{name}: </span>
      {/* The bar grows from the row's left edge and is never taller than the text beside it;
          the row gap is the surface gap that keeps the two apart when both are full. */}
      <span className="h-3 min-w-0 flex-1" aria-hidden>
        <span
          className="block h-full rounded-control"
          style={{ width: `${Math.max(share, 0)}%`, background: color }}
        />
      </span>
      <span className="w-[7.5rem] shrink-0 text-right text-sm leading-tight tabular-nums">
        {side.value ? side.text : <span className="text-ink-muted">{side.text}</span>}
        {side.sub?.map((line) => (
          <span key={line} className="block text-xs text-ink-muted">
            {line}
          </span>
        ))}
      </span>
    </div>
  );
}
