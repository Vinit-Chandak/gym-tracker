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
import { BodySection } from "./sections/body-section";
import { FoodSection } from "./sections/food-section";
import { OverviewSection } from "./sections/overview-section";
import { RecoverySection } from "./sections/recovery-section";
import { RunningSection } from "./sections/running-section";
import { StrengthSection } from "./sections/strength-section";

/**
 * The range a section is drawn over, for the dates beside its name and the funnel's. Overview
 * has none: its month is this month and its list the latest (ADR 0045).
 */
function sectionRange(section: ProgressSection, data: ProgressData): GraphRange | null {
  switch (section) {
    case "overview":
      return null;
    case "strength":
      return data.strength.range;
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
  const range = sectionRange(tab, data);
  const rangeText = range ? formatDateRange(range.from, range.to) : null;

  return (
    <GraphRangeProvider preset={data.preset}>
      <div className="progress-view">
        <ProgressSections
          value={tab}
          onChange={chooseView}
          range={rangeText}
          // Dates chosen by hand narrow the graphs; Overview has none, so no funnel.
          filters={
            range && rangeText ? (
              <FilterSheet title="Custom dates" summary={rangeText} count={data.preset ? 0 : 1}>
                {(close) => <DateRangeFields from={range.from} to={range.to} onApplied={close} />}
              </FilterSheet>
            ) : null
          }
        />
        {data.error && (
          <p role="alert" className="mt-3 flex items-start gap-2 type-meta font-semibold">
            <Glyph name="warn" className="mt-px glyph-18" />
            {data.error}
          </p>
        )}

        {/* Only the chosen section is mounted; the controls above it keep their state. */}
        <section
          aria-label={PROGRESS_SECTIONS.find((option) => option.value === tab)!.label}
          className="min-w-0"
        >
          {tab === "overview" && (
            <OverviewSection month={data.month} overview={data.overview} today={data.today} />
          )}
          {tab === "strength" && (
            <StrengthSection strength={data.strength} exercise={data.exercise} today={data.today} />
          )}
          {tab === "running" && <RunningSection running={data.running} today={data.today} />}
          {tab === "food" && <FoodSection food={data.food} today={data.today} />}
          {tab === "recovery" && <RecoverySection recovery={data.recovery} today={data.today} />}
          {tab === "body" && <BodySection body={data.body} today={data.today} />}
        </section>
      </div>
    </GraphRangeProvider>
  );
}
