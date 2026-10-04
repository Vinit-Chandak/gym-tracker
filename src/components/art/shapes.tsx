import type { CSSProperties } from "react";

import type { Paint, Paintable, Shape } from "./geometry";

/** What the art stands on: a print's paper, or the ground, for a mark beside a name. */
export type Surface = "paper" | "ground";

/**
 * A paint as the token that carries it. A cut is whatever the form stands on showing through;
 * on the ground a mark takes the interface's ink and warm-up grey rather than the print's.
 */
export function paintToken(paint: Paint, surface: Surface): string {
  switch (paint) {
    case "cut":
      return surface === "paper" ? "var(--ov-paper)" : "var(--ov-ground)";
    case "ink":
      return surface === "paper" ? "var(--ov-print-ink)" : "var(--ov-ink)";
    case "warm":
      return surface === "paper" ? "var(--ov-print-warm-up)" : "var(--ov-mark-warm-up)";
    case "label":
      return "var(--ov-print-label)";
    case "dot":
      return "var(--ov-print-dot)";
    case "ochre":
      return "var(--ov-print-ochre)";
    case "straw":
      return "var(--ov-print-straw)";
    default:
      return `var(--ov-print-${paint})`;
  }
}

/**
 * Colours go in `style`, not in presentation attributes: an attribute cannot hold a custom
 * property in every engine, and the tokens are what keep one geometry right on both papers.
 */
function paintStyle(shape: Paintable, surface: Surface): CSSProperties {
  return {
    fill:
      shape.fill === undefined || shape.fill === "none" ? "none" : paintToken(shape.fill, surface),
    stroke: shape.stroke ? paintToken(shape.stroke, surface) : undefined,
  };
}

function strokeProps(shape: Paintable) {
  return {
    fillOpacity: shape.fillOpacity,
    strokeWidth: shape.stroke ? (shape.strokeWidth ?? 1) : undefined,
    strokeDasharray: shape.dash ? `${shape.dash[0]} ${shape.dash[1]}` : undefined,
    strokeLinecap: shape.linecap,
    strokeLinejoin: shape.linejoin,
  };
}

/** Draws shapes from the geometry. `id` makes clip paths unique on the page. */
export function Shapes({
  shapes,
  surface,
  id,
}: {
  shapes: readonly Shape[];
  surface: Surface;
  id: string;
}) {
  return shapes.map((shape, i) => {
    const key = `${id}-${i}`;
    switch (shape.kind) {
      case "rect":
        return (
          <rect
            key={key}
            x={shape.x}
            y={shape.y}
            width={Math.max(0, shape.width)}
            height={Math.max(0, shape.height)}
            style={paintStyle(shape, surface)}
            {...strokeProps(shape)}
          />
        );
      case "path":
        return (
          <path key={key} d={shape.d} style={paintStyle(shape, surface)} {...strokeProps(shape)} />
        );
      case "circle":
        return (
          <circle
            key={key}
            cx={shape.cx}
            cy={shape.cy}
            r={Math.max(0, shape.r)}
            style={paintStyle(shape, surface)}
            {...strokeProps(shape)}
          />
        );
      case "clip": {
        const clipId = `${id}-c${i}`;
        return (
          <g key={key}>
            <clipPath id={clipId}>
              <path d={shape.clip} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <Shapes shapes={shape.shapes} surface={surface} id={clipId} />
            </g>
          </g>
        );
      }
      case "text":
        // The one figure the month prints: +N, past four activities in a day.
        return (
          <text
            key={key}
            x={shape.x}
            y={shape.y}
            textAnchor="middle"
            className="type-print-label"
            style={{ fill: paintToken("ink", surface) }}
          >
            {shape.text}
          </text>
        );
    }
  });
}

/** An id safe inside `url(#…)`, from React's useId. */
export const svgId = (reactId: string): string => `art${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
