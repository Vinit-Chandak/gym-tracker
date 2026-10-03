"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { dayPrint, type PrintPart } from "./geometry";
import { Shapes, svgId } from "./shapes";

/**
 * The paper's grain, over the whole print: multiply at 6% on light paper, screen at 4.5% on
 * dark. Both filters are drawn and the palette turns one of them off, so the choice of paper
 * stays in CSS. Turbulence is measured in points, so the grain is the same at any size.
 */
export function Grain() {
  const id = svgId(useId());
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      style={{ mixBlendMode: "var(--ov-grain-blend)" as "multiply" }}
    >
      <defs>
        {(
          [
            ["l", "0.1 0.09 0.08"],
            ["d", "0.95 0.93 0.9"],
          ] as const
        ).map(([mode, rgb]) => {
          const [r, g, b] = rgb.split(" ");
          return (
            <filter key={mode} id={`${id}${mode}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves={2}
                seed={11}
                stitchTiles="stitch"
              />
              <feColorMatrix values={`0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0`} />
            </filter>
          );
        })}
      </defs>
      <rect
        width="100%"
        height="100%"
        filter={`url(#${id}l)`}
        style={{ opacity: "var(--ov-grain-multiply)" }}
      />
      <rect
        width="100%"
        height="100%"
        filter={`url(#${id}d)`}
        style={{ opacity: "var(--ov-grain-screen)" }}
      />
    </svg>
  );
}

/**
 * A day's print, laid out on the box it is given. The module, and so the size of every form,
 * comes from the box's width and height (DESIGN.md: laid out from the device, not scaled from
 * one size), so the box is measured; until it is, the print is drawn for `fallback`, a 402-pt
 * phone's, and scaled into the box.
 */
export function DayPrint({
  parts,
  label,
  className,
  maxModule,
  module,
  fallback = { width: 362, height: 214 },
  onModule,
}: {
  parts: readonly PrintPart[];
  label?: string;
  className?: string;
  maxModule?: number;
  module?: number;
  fallback?: { width: number; height: number };
  /**
   * Hears the largest module the print fits its box at, whatever `module` it is drawn at, so a
   * page of prints can draw every one at the smallest (board Training).
   */
  onModule?: (module: number) => void;
}) {
  const id = svgId(useId());
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(fallback);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0)
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitted = dayPrint({ ...size, parts, maxModule });
  const layout = module === undefined ? fitted : dayPrint({ ...size, parts, maxModule, module });
  useLayoutEffect(() => {
    onModule?.(fitted.module);
  }, [fitted.module, onModule]);

  return (
    <div
      ref={box}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative isolate overflow-hidden rounded-print bg-paper", className)}
    >
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        <Shapes shapes={layout.shapes} surface="paper" id={id} />
      </svg>
      <Grain />
    </div>
  );
}
