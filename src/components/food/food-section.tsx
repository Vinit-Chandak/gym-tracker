"use client";

import { useRef, useState, type ReactNode } from "react";

import { PageTabs } from "@/components/ui/page-tabs";

/** Saved meals a page: few enough that Foods still starts on a phone's first screen. */
export const MEALS_PER_PAGE = 5;
/** Foods a page: Foods comes last, so it can run on with fewer turns of the page. */
export const FOODS_PER_PAGE = 10;

/**
 * The Meals or the Foods of a meal's page, My foods or a meal being built (owner, 8 October
 * 2026; ADR 0045): its heading, its rows a page at a time, the most eaten first, and the page
 * tabs History reads its pages with (ADR 0044). However many meals there are, Foods starts where
 * it did. A new search starts it again at the first page: the caller keys it by the search, or
 * turns its own page back.
 */
export function FoodSection<T>({
  title,
  items,
  perPage,
  row,
  page: kept,
  onPage,
}: {
  /** The heading, and the list's name aloud: "Meals", "Foods". */
  title: string;
  items: readonly T[];
  perPage: number;
  /** One item's `<li>`, keyed. */
  row: (item: T) => ReactNode;
  /**
   * The page, where the caller keeps it, with `onPage`: My foods keeps its in the URL, so Back
   * from a saved meal returns to it. Without them the section keeps its own, from the first.
   */
  page?: number;
  onPage?: (page: number) => void;
}) {
  const [own, setOwn] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  if (items.length === 0) return null;
  const pages = Math.ceil(items.length / perPage);
  const current = Math.min(kept ?? own, pages);
  const turn = (next: number) => {
    if (onPage) onPage(next);
    else setOwn(next);
    // The new page is read from its heading, if the list had been scrolled past it.
    if ((heading.current?.getBoundingClientRect().top ?? 0) < 0) {
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      heading.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  };
  return (
    <section className="mt-5">
      <h2 ref={heading} className="caption-head scroll-mt-20">
        {title}
      </h2>
      <ul className="food-list" aria-label={title}>
        {items.slice((current - 1) * perPage, current * perPage).map(row)}
      </ul>
      <PageTabs
        page={current}
        total={pages}
        onChange={turn}
        label={`${title} pages`}
        className="mt-3"
      />
    </section>
  );
}
