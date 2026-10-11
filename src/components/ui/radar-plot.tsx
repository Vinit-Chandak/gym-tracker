"use client";

import { useRef } from "react";

import { useMeasure } from "@/components/ui/use-width";

import type { RadarSeries } from "./radar-chart";

// Drawn in a fixed box and scaled by the container: the geometry is the same at 320px and
// on a tablet. The labels are not scaled with it: they are sized against the width the box is
// drawn at, so they read at 12 px at 100% text however small the phone, and grow with the
// reader's text (DESIGN.md, the Floors Rule).
const SIZE = 320;
const CENTRE = SIZE / 2;
const RADIUS = 96;
/**
 * The smallest the shape is drawn with its labels around it: two thirds. Below it, large text
 * would leave a dot in a ring of words, so the labels leave the drawing for a key under it.
 */
const READABLE_RADIUS = 64;
const LABEL_GAP = 16;
const LABEL_PX = 12;
/** How far past the box a label may run, into the card's padding, as it always could. */
const OVERHANG = 20;
const RINGS = [0.25, 0.5, 0.75, 1];

/** The box's width before it is measured: its widest, 22rem. */
const FALLBACK = { width: 352, height: 352, root: 16 };

/** Which way spoke `index` of `count` points, the first straight up. */
function direction(index: number, count: number) {
  const angle = -Math.PI / 2 + (index / count) * 2 * Math.PI;
  return { cos: Math.cos(angle), sin: Math.sin(angle) };
}

function point(radius: number, index: number, count: number, share: number) {
  const { cos, sin } = direction(index, count);
  const r = radius * Math.min(Math.max(share, 0), 1);
  return { x: CENTRE + r * cos, y: CENTRE + r * sin };
}

function polygon(radius: number, count: number, shares: readonly number[]): string {
  return Array.from({ length: count }, (_, i) => point(radius, i, count, shares[i] ?? 0))
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/**
 * The label size in the drawing's own units, the radius that leaves the labels room, and
 * whether the labels are in the drawing at all. A label beside the shape needs its width
 * across, as far out as its spoke leans; one above or below it (Back, Shoulders) is centred on
 * its spoke and needs only its height. Each may run about 20 units past the box. Measuring
 * every label as if it sat beside the shape, as this once did, gave "Shoulders" at the foot
 * the width it does not need, and at 200% text the shape shrank to a dot. Where even so the
 * shape would be drawn under two thirds of its size, the spokes are numbered and the names
 * listed under the drawing (`keyed`) instead: a number needs little room.
 */
export function radarLayout(width: number, root: number, axes: readonly string[]) {
  const fontSize = (LABEL_PX * (root / 16) * SIZE) / Math.max(width, 1);
  const room = (labels: readonly string[]) =>
    Math.min(
      RADIUS,
      ...labels.map((label, index) => {
        const { cos, sin } = direction(index, labels.length);
        // Above or below: its height, the baseline a third of the size past the spoke's end.
        const tall =
          Math.abs(sin) < 0.01
            ? RADIUS
            : (CENTRE + OVERHANG - 0.6 * fontSize) / Math.abs(sin) - LABEL_GAP;
        if (Math.abs(cos) < 0.01) return tall;
        // Beside: its width, running outward from the spoke's end.
        const across = 0.55 * fontSize * label.length;
        return Math.min(tall, (CENTRE + OVERHANG - across) / Math.abs(cos) - LABEL_GAP);
      }),
    );
  const radius = room(axes);
  if (radius >= READABLE_RADIUS) return { fontSize, radius, keyed: false };
  const numbers = axes.map((_, index) => String(index + 1));
  return { fontSize, radius: Math.max(0, room(numbers)), keyed: true };
}

/**
 * The radar's drawing: rings, spokes, labels and one filled shape per series. Two shapes take
 * the theme's wash (`--ov-series-wash`), thinner in dark, where a wash of light ink is a grey
 * like the other's and only the edges, ink and control as the legend has them, tell them apart.
 */
export function RadarPlot({
  label,
  axes,
  series,
  outer,
}: {
  label: string;
  axes: readonly string[];
  series: readonly RadarSeries[];
  /** The share the outer ring stands for. */
  outer: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const { width, root } = useMeasure(box, probe, FALLBACK);
  const count = axes.length;
  const multi = series.length > 1;
  const { fontSize, radius, keyed } = radarLayout(width, root, axes);
  return (
    <div ref={box} className="relative mx-auto w-full max-w-[22rem]">
      <span ref={probe} aria-hidden className="pointer-events-none absolute h-0 w-[1rem]" />
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={label}
        className="block w-full overflow-visible select-none"
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(
              radius,
              count,
              axes.map(() => ring),
            )}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        ))}
        {axes.map((axis, i) => {
          const end = point(radius, i, count, 1);
          const at = point(radius + LABEL_GAP, i, count, 1);
          const anchor = Math.abs(at.x - CENTRE) < 1 ? "middle" : at.x > CENTRE ? "start" : "end";
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
                x={at.x}
                y={at.y + fontSize / 3}
                textAnchor={anchor}
                fontSize={fontSize.toFixed(2)}
                fill="var(--color-ink-muted)"
              >
                {keyed ? i + 1 : axis}
              </text>
            </g>
          );
        })}
        {/* Keyed by position: two people can share a name. */}
        {series.map((s, i) => (
          <g key={i}>
            <polygon
              points={polygon(
                radius,
                count,
                s.values.map((value) => value / outer),
              )}
              fill={s.color}
              fillOpacity={multi ? undefined : 0.28}
              style={multi ? { fillOpacity: "var(--ov-series-wash, 0.32)" } : undefined}
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>
      {keyed && (
        // The names the numbered spokes stand for, in the reader's own text size. The drawing
        // itself is an image to a screen reader, which has the table beneath.
        <ol
          aria-hidden
          className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-ink-muted"
        >
          {axes.map((axis, i) => (
            <li key={axis}>
              <span className="font-medium tabular-nums">{i + 1}</span> {axis}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
