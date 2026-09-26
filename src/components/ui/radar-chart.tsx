import { ChevronDown } from "@/components/ui/icons";

import { cn } from "@/lib/utils";

export type RadarSeries = {
  name: string;
  /** A theme series token: `var(--color-series-1)`. Never a literal hex. */
  color: string;
  /** One value per axis, in the same order as `axes`, each between 0 and 1. */
  values: readonly number[];
};

type RadarChartProps = {
  title: string;
  axes: readonly string[];
  /** One polygon, or two laid over each other (Compare). */
  series: readonly RadarSeries[];
  /** How a value reads in the table: shares are percentages unless told otherwise. */
  format?: (value: number) => string;
  className?: string;
};

// Drawn in a fixed box and scaled by the container: the geometry is the same at 320px and
// on a tablet, and the labels grow with it rather than colliding at small widths.
const SIZE = 320;
const CENTRE = SIZE / 2;
// The radius leaves room for a nine-letter label at either side, inside the box.
const RADIUS = 96;
const LABEL_RADIUS = RADIUS + 16;
const RINGS = [0.25, 0.5, 0.75, 1];

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Where an axis's point sits for a share, the first axis straight up and the rest clockwise. */
function point(index: number, count: number, share: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / count) * 2 * Math.PI;
  const r = RADIUS * Math.min(Math.max(share, 0), 1);
  return { x: CENTRE + r * Math.cos(angle), y: CENTRE + r * Math.sin(angle) };
}

function polygon(count: number, shares: readonly number[]): string {
  return Array.from({ length: count }, (_, i) => point(i, count, shares[i] ?? 0))
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/**
 * A radar of a few axes (plan §3.10): the shape of a training split at a glance, and for two
 * people whether the shapes match. Hand-drawn SVG on the theme's series tokens, like `Chart`.
 * Rings and spokes are hairlines; each polygon is a filled shape — a translucent wash of its
 * series colour under a 2px edge, no markers at the corners — so two shapes read as two
 * areas and stay legible where they cross, the overlap darker than either. The values are
 * in the table beneath for anyone who cannot read the shape.
 */
export function RadarChart({ title, axes, series, format = percent, className }: RadarChartProps) {
  const count = axes.length;
  const multi = series.length > 1;
  // The outer ring is the largest share on the chart, rounded up to the next 5%: six groups
  // share one whole, so nothing ever nears 100%, and drawn against it every split would be a
  // speck in the middle. The table beneath keeps the real percentages.
  const outer = Math.max(0.05, Math.ceil(Math.max(...series.flatMap((s) => s.values)) * 20) / 20);
  const scaled = (values: readonly number[]) => values.map((value) => value / outer);
  return (
    <figure className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        {/* A legend only once there is more than one shape; a single one is the caption. */}
        {multi && (
          <ul className="flex flex-wrap gap-3">
            {series.map((s) => (
              <li key={s.name} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${title}: ${series.map((s) => s.name).join(" and ")} across ${axes.join(", ")}. Values available in the table below.`}
        className="mx-auto block w-full max-w-[22rem] overflow-visible select-none"
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(
              count,
              axes.map(() => ring),
            )}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        ))}
        {axes.map((axis, i) => {
          const end = point(i, count, 1);
          const label = point(i, count, LABEL_RADIUS / RADIUS);
          const anchor =
            Math.abs(label.x - CENTRE) < 1 ? "middle" : label.x > CENTRE ? "start" : "end";
          return (
            <g key={axis}>
              <line
                x1={CENTRE}
                y1={CENTRE}
                x2={end.x}
                y2={end.y}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              <text
                x={label.x}
                y={label.y + 4}
                textAnchor={anchor}
                fontSize="12"
                fill="var(--color-ink-muted)"
              >
                {axis}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <g key={s.name}>
            <polygon
              points={polygon(count, scaled(s.values))}
              fill={s.color}
              fillOpacity={multi ? 0.32 : 0.28}
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>
      <details className="group text-xs text-ink-muted">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium select-none">
          <ChevronDown
            className="shrink-0 transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
            aria-hidden
          />
          View values
          {/* Several charts on one screen: a screen reader's list of controls tells them apart. */}
          <span className="sr-only"> for {title}</span>
        </summary>
        <table className="w-full table-fixed text-left [overflow-wrap:anywhere] tabular-nums">
          <caption className="sr-only">{title} by axis</caption>
          <thead>
            <tr className="text-ink-subtle">
              <th scope="col" className="py-1.5 font-medium">
                Group
              </th>
              {series.map((s) => (
                <th scope="col" key={s.name} className="py-1.5 text-right font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes.map((axis, i) => (
              <tr key={axis} className="border-t border-line">
                <th scope="row" className="py-1.5 font-normal">
                  {axis}
                </th>
                {series.map((s) => (
                  <td key={s.name} className="py-1.5 text-right">
                    {format(s.values[i] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
