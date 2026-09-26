"use client";

import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { SectionSelect } from "@/components/ui/section-select";

/**
 * Progress's sections, as the picker lists them: Overview, which the tab opens on, then History,
 * everything done, day by day (ADR 0034), then a section per subject.
 */
export const PROGRESS_SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "history", label: "History" },
  { value: "strength", label: "Strength" },
  { value: "running", label: "Running" },
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
 * The one picker for Progress's sections, on the Progress page and on History's.
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
  action,
}: {
  value: ProgressSection;
  /** Switches the Progress page's own sections in place. */
  onChange?: (section: ProgressPageSection) => void;
  /** The filters beside the picker. */
  action: ReactNode;
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
    <SectionSelect
      label="Progress section"
      options={options}
      value={value}
      onChange={(section) => {
        if (section !== "history") onChange?.(section);
      }}
      action={action}
    />
  );
}
