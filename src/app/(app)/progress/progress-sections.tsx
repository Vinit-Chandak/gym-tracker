"use client";

import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { SectionSelect } from "@/components/ui/section-select";

/**
 * Progress's sections, as the picker lists them (DESIGN.md, Navigation; ADR 0034): Overview,
 * the month on paper, which the tab opens on, then History, everything done, day by day, then a
 * section per subject, each drawn by the same graphs (ADR 0042).
 */
export const PROGRESS_SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "history", label: "History" },
  { value: "strength", label: "Strength" },
  { value: "running", label: "Running" },
  { value: "food", label: "Food" },
  { value: "recovery", label: "Recovery" },
  { value: "body", label: "Body" },
] as const;
export type ProgressSection = (typeof PROGRESS_SECTIONS)[number]["value"];
/** The sections the Progress page draws itself, from what it has already read. */
export type ProgressPageSection = Exclude<ProgressSection, "history">;

/**
 * The section a `?view=` names, or Overview. History is a page of its own, so a view naming it
 * is only ever a link made by hand.
 */
export function pageSection(view: string | null): ProgressPageSection {
  const named = PROGRESS_SECTIONS.find((section) => section.value === view)?.value;
  return named && named !== "history" ? named : "overview";
}

/** Where a section lives: History has a page, the rest are `?view=` of the Progress page. */
function sectionHref(section: ProgressSection, search: string): Route {
  const params = new URLSearchParams(search);
  if (section === "overview" || section === "history") params.delete("view");
  else params.set("view", section);
  const query = params.toString();
  const path = section === "history" ? "/progress/history" : "/progress";
  return (query ? `${path}?${query}` : path) as Route;
}

/**
 * Progress's opening, on the Progress page and on History's (boards Progress, Progress-History):
 * the title with the filters' funnel at its end, then the one picker for the sections, the range
 * the section is drawn over beside it.
 *
 * History reads what the charts do not, a list of every record, so it is a page of its own
 * rather than a view: the Progress page does not pay for it until it is chosen. Moving between
 * the two keeps the query, so the dates chosen on one hold on the other, and so does anything
 * else either keeps there. The Progress page loads History whole as soon as the list is open, so
 * choosing it is as quick as choosing a view.
 */
export function ProgressSections({
  value,
  onChange,
  filters,
  range,
}: {
  value: ProgressSection;
  /** Switches the Progress page's own sections in place. */
  onChange?: (section: ProgressPageSection) => void;
  /** The filter sheet, at the end of the title. */
  filters: ReactNode;
  /** The range the section is drawn over; none where it shows something else (the month). */
  range?: string | null;
}) {
  const search = useSearchParams().toString();
  const options = PROGRESS_SECTIONS.map((section) =>
    (section.value === "history") === (value === "history")
      ? section
      : {
          ...section,
          href: sectionHref(section.value, search),
          // History is loaded whole once the list shows it. The Progress page's sections are
          // left to Next's own prefetch: five whole Progress pages at once would compete with
          // the tap, and the tab's own prefetch already holds the page without a query.
          prefetch: section.value === "history" ? true : undefined,
        },
  );
  return (
    <header className="progress-head">
      <div className="page-header-top">
        <h1 className="type-title">Progress</h1>
        {filters && <div className="page-header-action">{filters}</div>}
      </div>
      <SectionSelect
        label="Progress section"
        options={options}
        value={value}
        onChange={(section) => {
          if (section !== "history") onChange?.(section);
        }}
        action={
          range ? (
            <span className="type-meta-small font-semibold text-ink-2 tabular-nums">{range}</span>
          ) : undefined
        }
      />
    </header>
  );
}
