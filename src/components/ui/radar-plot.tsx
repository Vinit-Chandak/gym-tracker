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
/** The smallest the shape is drawn when large labels need the room around it: a third. */
const SMALLEST_RADIUS = 32;
const LABEL_GAP = 16;
const LABEL_PX = 12;
const RINGS = [0.25, 0.5, 0.75, 1];

/** The box's width before it is measured: its widest, 22rem. */
const FALLBACK = { width: 352, height: 352, root: 16 };

function point(radius: number, index: number, count: number, share: number) {
  const angle = -Math.PI / 2 + (index / count) * 2 * Math.PI;
  const r = radius * Math.min(Math.max(share, 0), 1);
  return { x: CENTRE + r * Math.cos(angle), y: CENTRE + r * Math.sin(angle) };
}

function polygon(radius: number, count: number, shares: readonly number[]): string {
  return Array.from({ length: count }, (_, i) => point(radius, i, count, shares[i] ?? 0))
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/**
 * The label size in the drawing's own units, and the radius that leaves the labels room: the
 * longest label beside the shape, allowed about 20 units past the box as it always was.
 */
export function radarLayout(width: number, root: number, longest: number) {
  const fontSize = (LABEL_PX * (root / 16) * SIZE) / Math.max(width, 1);
  const labelWidth = 0.55 * fontSize * longest;
  const radius = Math.min(
    RADIUS,
    Math.max(SMALLEST_RADIUS, CENTRE - LABEL_GAP - (labelWidth - 20)),
  );
  return { fontSize, radius };
}

/** The radar's drawing: rings, spokes, labels and one filled shape per series. */
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
  const { fontSize, radius } = radarLayout(
    width,
    root,
    Math.max(0, ...axes.map((axis) => axis.length)),
  );
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
                {axis}
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
              fillOpacity={multi ? 0.32 : 0.28}
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
