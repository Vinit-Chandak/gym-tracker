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

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-heading">Working sets</h2>
        <InfoTip label="About working sets">
          Working sets from finished workouts. A set counts once for each primary muscle and half
          for each secondary one; warm-ups are excluded.
        </InfoTip>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous week"
          disabled={pending}
          onClick={() => stepWeek(-7)}
          className="session-icon-button -ml-[10px] disabled:text-ink-2"
        >
          <Glyph name="chevronLeft" className="glyph-22" />
        </button>
        <p className="min-w-0 text-center type-meta font-semibold tabular-nums">
          {current ? "This week" : weekLabel(muscles.from, muscles.to, today)}
        </p>
        <button
          type="button"
          aria-label="Next week"
          disabled={pending || muscles.to >= today}
          onClick={() => stepWeek(7)}
          className="session-icon-button -mr-[10px] disabled:text-ink-2"
        >
          <Glyph name="chevronRight" className="glyph-22" />
        </button>
      </div>
      <div className={pending ? "opacity-50 transition-opacity" : undefined}>
        <BodyMap volume={muscles.volume} totalSets={muscles.totalSets} />
      </div>
    </div>
  );
}
