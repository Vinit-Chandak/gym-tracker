"use client";

import type { ReactNode } from "react";

import { SectionSelect } from "@/components/ui/section-select";

/**
 * Progress's sections, as the picker lists them (DESIGN.md, Navigation; ADR 0034): Overview,
 * the month on paper and the latest ten under it, which the tab opens on, then a section per
 * subject, each drawn by the same graphs (ADR 0042). History is not one of them any more
 * (ADR 0045): Overview lists the latest, and every entry is a page behind it. Muscles, the body
 * map, stands beside Strength on a week of its own; Body weight keeps `body`, so links to it
 * still hold (ADR 0047).
 */
export const PROGRESS_SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "strength", label: "Strength" },
  { value: "muscles", label: "Muscles" },
  { value: "running", label: "Running" },
  { value: "food", label: "Food" },
  { value: "recovery", label: "Recovery" },
  { value: "body", label: "Body weight" },
] as const;
export type ProgressSection = (typeof PROGRESS_SECTIONS)[number]["value"];

/** The section a `?view=` names, or Overview. */
export function pageSection(view: string | null): ProgressSection {
  return PROGRESS_SECTIONS.find((section) => section.value === view)?.value ?? "overview";
}

/**
 * Progress's opening (board Progress): the title with the filters' funnel at its end, then the
 * one picker for the sections, the range the section is drawn over beside it. A section is
 * chosen in place, on the page that has already read them all.
 */
export function ProgressSections({
  value,
  onChange,
  filters,
  range,
}: {
  value: ProgressSection;
  onChange?: (section: ProgressSection) => void;
  /** The filter sheet, at the end of the title. */
  filters: ReactNode;
  /** The range the section is drawn over; none where it shows something else (the month). */
  range?: string | null;
}) {
  return (
    <header className="progress-head">
      <div className="page-header-top">
        <h1 className="type-title">Progress</h1>
        {filters && <div className="page-header-action">{filters}</div>}
      </div>
      <SectionSelect
        label="Progress section"
        options={PROGRESS_SECTIONS}
        value={value}
        onChange={onChange}
        action={
          range ? (
            <span className="type-meta-small font-semibold text-ink-2 tabular-nums">{range}</span>
          ) : undefined
        }
      />
    </header>
  );
}
