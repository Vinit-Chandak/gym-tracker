"use client";

import { useSearchParams } from "next/navigation";

import { DateRangeFields } from "@/components/date-range-fields";
import { GraphRangeProvider } from "@/components/graph/graph-range-context";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { Glyph } from "@/components/ui/glyphs";
import type { GraphRange } from "@/domain/graph-range";
import { formatDateRange } from "@/lib/format";

import {
  pageSection,
  PROGRESS_SECTIONS,
  ProgressSections,
  type ProgressSection,
} from "./progress-sections";
import type { ProgressData } from "./progress-types";
import { BodyWeightSection } from "./sections/body-weight-section";
import { FoodSection } from "./sections/food-section";
import { MusclesSection } from "./sections/muscles-section";
import { OverviewSection } from "./sections/overview-section";
import { RecoverySection } from "./sections/recovery-section";
import { RunningSection } from "./sections/running-section";
import { StrengthSection } from "./sections/strength-section";

/**
 * The range a section is drawn over, for the dates beside its name and the funnel's. Overview
 * has none: its month is this month and its list the latest (ADR 0045). Nor has Muscles: it
 * keeps its own week, named over the body map (ADR 0047). Strength's is its exercise's while
 * one is drawn (`series`, as StrengthSection tests it): under All, that exercise's graph starts
 * at its own first workout, not at the first of any.
 */
function sectionRange(
  section: ProgressSection,
  data: ProgressData,
  series: string | null,
): GraphRange | null {
  switch (section) {
    case "overview":
      return null;
    case "strength":
      return data.exercise.selected && data.exercise.selected.id === series
        ? data.exercise.range
        : data.strength.range;
    case "muscles":
      return null;
    case "running":
      return data.running.range;
    case "food":
      return data.food.range;
    case "recovery":
      return data.recovery.range;
    case "body":
      return data.body.range;
  }
}

/**
 * Progress (ADR 0042): a section at a time, each drawn by the same graphs over the same span.
 * The span is chosen on any graph and kept for all of them; dates chosen by hand are the
 * filters' job, behind the funnel, and hold until a span is chosen again.
 */
export function ProgressView({ data }: { data: ProgressData }) {
  const params = useSearchParams();
  const tab = pageSection(params.get("view"));
  const chooseView = (section: ProgressSection) => {
    const next = new URLSearchParams(params.toString());
    if (section === "overview") next.delete("view");
    else next.set("view", section);
    // Local view state belongs in the URL so filters, reload and Back preserve it.
    const query = next.toString();
    window.history.replaceState(null, "", query ? `/progress?${query}` : "/progress");
  };
  const range = sectionRange(tab, data, params.get("series"));
  const rangeText = range ? formatDateRange(range.from, range.to) : null;
  // Every section says what it is drawn over under its name, Muscles its week, so each opens the
  // same way and its first content stands where every other's does (owner, 24 October 2026).
  const meta =
    rangeText ?? (tab === "muscles" ? formatDateRange(data.muscles.from, data.muscles.to) : null);
  // Dates that could not be read are said where a span is drawn; a week, only on Muscles.
  const error = tab === "muscles" ? data.weekError : range ? data.rangeError : null;

  return (
    <GraphRangeProvider preset={data.preset}>
      <div className="progress-view">
        <ProgressSections
          value={tab}
          onChange={chooseView}
          range={meta}
          // Dates chosen by hand narrow the graphs; Overview and Muscles have none, so no funnel.
          filters={
            range && rangeText ? (
              <FilterSheet title="Custom dates" summary={rangeText} count={data.preset ? 0 : 1}>
                {(close) => <DateRangeFields from={range.from} to={range.to} onApplied={close} />}
              </FilterSheet>
            ) : null
          }
        />
        <div className="page-width">
          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 type-meta font-semibold">
              <Glyph name="warn" className="mt-px glyph-18" />
              {error}
            </p>
          )}

          {/* Only the chosen section is mounted; the controls above it keep their state. */}
          <section
            aria-label={PROGRESS_SECTIONS.find((option) => option.value === tab)!.label}
            className="min-w-0"
          >
            {tab === "overview" && <OverviewSection month={data.month} />}
            {tab === "strength" && (
              <StrengthSection
                strength={data.strength}
                exercise={data.exercise}
                today={data.today}
              />
            )}
            {tab === "muscles" && <MusclesSection muscles={data.muscles} today={data.today} />}
            {tab === "running" && <RunningSection running={data.running} today={data.today} />}
            {tab === "food" && <FoodSection food={data.food} today={data.today} />}
            {tab === "recovery" && <RecoverySection recovery={data.recovery} today={data.today} />}
            {tab === "body" && <BodyWeightSection body={data.body} today={data.today} />}
          </section>
        </div>
      </div>
    </GraphRangeProvider>
  );
}
