"use client";

import { useLayoutEffect, useRef, useState, type ElementType } from "react";

import { cn } from "@/lib/utils";

import { rampSize, titleSize } from "./fit";

export type TitleSizes = {
  /** At 402 × 874 and up. */
  base: number;
  /** Under 800 pt tall. */
  short?: number;
  /** Under 360 pt wide. */
  narrow?: number;
};

/**
 * A screen's title (DESIGN.md, Typography): Jost 700 at its size for the screen, stepping down
 * 4 for a long name, then to 26 and two lines, never cut. Drawn at the base size until it is
 * measured, and grown with the reader's text by three quarters.
 */
export function FitTitle({
  children,
  sizes,
  as: Tag = "h2",
  id,
  className,
  room = 0,
}: {
  children: string;
  sizes: TitleSizes;
  as?: ElementType;
  id?: string;
  className?: string;
  /** Points the line keeps for something beside the name. */
  room?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState(sizes.base);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width <= 0) return;
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const grow = 0.25 + (0.75 * root) / 16;
      const base =
        window.innerWidth < 360 && sizes.narrow
          ? sizes.narrow
          : window.innerHeight < 800 && sizes.short
            ? sizes.short
            : sizes.base;
      setSize(titleSize(children, (width - room) / grow, base));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, room, sizes.base, sizes.narrow, sizes.short]);

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn("fit-title", className)}
      style={{ fontSize: rampSize(size, 0.75) }}
    >
      {children}
    </Tag>
  );
}
