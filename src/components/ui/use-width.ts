"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type Measure = {
  /** The element's width and height, in points. */
  width: number;
  height: number;
  /** The root font size: 16 at 100% text, 32 at 200%. */
  root: number;
};

const SAME = (a: number, b: number) => Math.abs(a - b) < 0.5;

/**
 * An element's size and the reader's text size, kept current. Before it is measured (the
 * server's render, the first frame) it is `fallback`, a 402 × 874 phone at 100%. `probe` is an
 * element sized in rem: watching it catches a change of text size that moves nothing else.
 */
export function useMeasure(
  ref: RefObject<HTMLElement | null>,
  probe?: RefObject<HTMLElement | null>,
  fallback: Measure = { width: 402, height: 874, root: 16 },
): Measure {
  const [box, setBox] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      if (rect.width <= 0) return;
      setBox((current) =>
        SAME(current.width, rect.width) &&
        SAME(current.height, rect.height) &&
        current.root === root
          ? current
          : { width: rect.width, height: rect.height, root },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (probe?.current) observer.observe(probe.current);
    return () => observer.disconnect();
  }, [ref, probe]);
  return box;
}

/** The width of an element, in points, kept current; a 402-pt phone's until measured. */
export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 402): number {
  return useMeasure(ref, undefined, { width: fallback, height: 874, root: 16 }).width;
}
