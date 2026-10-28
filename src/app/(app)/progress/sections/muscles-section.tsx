"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { weekLabel } from "@/components/graph/labels";
import { BodyMap } from "@/components/ui/body-map";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";

import type { ProgressData } from "../progress-types";

/**
 * Muscles (ADR 0047): the working sets a week gave each muscle, on the body map. A snapshot,
 * not a trend, so it keeps its own week, Monday to Sunday, stepped by its own arrows rather
 * than the span the graphs share. The week is named as a graph names it, "This week" while it
 * runs; nothing is trained in a week still to come, so the arrows stop at this one.
 */
export function MusclesSection({ muscles, today }: Pick<ProgressData, "muscles" | "today">) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = muscles.from <= today && today <= muscles.to;

  const stepWeek = (days: number) => {
    const next = new URLSearchParams(params.toString());
    const d = new Date(`${muscles.from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    next.set("week", d.toISOString().slice(0, 10));
    startTransition(() => router.replace(`/progress?${next}` as Route, { scroll: false }));
  };

  // As every section opens (DESIGN.md, Graphs): its control first, a tray as wide as the page,
  // where Running keeps Distance, Pace and Duration; then the caption the graphs' readouts take,
  // its ⓘ at its end; then the map.
  return (
    <div className="progress-section">
      <div role="group" aria-label="Week" className="week-stepper">
        <button
          type="button"
          aria-label="Previous week"
          disabled={pending}
          onClick={() => stepWeek(-7)}
          className="week-stepper-button"
        >
          <Glyph name="chevronLeft" className="glyph-22" />
        </button>
        <p className="week-stepper-label">
          {current ? "This week" : weekLabel(muscles.from, muscles.to, today)}
        </p>
        <button
          type="button"
          aria-label="Next week"
          disabled={pending || muscles.to >= today}
          onClick={() => stepWeek(7)}
          className="week-stepper-button"
        >
          <Glyph name="chevronRight" className="glyph-22" />
        </button>
      </div>
      {/* The map is a card, as every graph is: its caption, the figures, their key and the
          numbers folded at its foot. */}
      <div className="chart-card">
        <div className="graph-readout-head">
          <h2 className="graph-readout-label">Working sets</h2>
          <InfoTip label="About working sets" className="graph-readout-note">
            Working sets from finished workouts. A set counts once for each primary muscle and half
            for each secondary one; warm-ups are excluded.
          </InfoTip>
        </div>
        <div className={pending ? "opacity-50 transition-opacity" : undefined}>
          <BodyMap volume={muscles.volume} totalSets={muscles.totalSets} />
        </div>
      </div>
    </div>
  );
}
