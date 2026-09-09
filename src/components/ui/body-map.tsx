"use client";

import { useState } from "react";

import { MUSCLE_GROUPS, type MuscleGroup } from "@/domain/types";
import {
  VOLUME_BANDS,
  volumeStep,
  type MuscleVolume,
  type VolumeStep,
} from "@/domain/muscle-volume";
import { MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { BODY_OUTLINE, BODY_REGIONS, BODY_VIEWBOX, type BodyView } from "./body-regions";

/**
 * One hue, five steps light to dark-to-bright, the sequential ramp a magnitude scale wants.
 * Step 0 is the untrained body itself, a hair above the card so the figure still reads.
 */
const STEP_FILL: Record<VolumeStep, string> = {
  0: "var(--color-surface-raised)",
  1: "#5c4310",
  2: "#8a6415",
  3: "#c08a1e",
  4: "#f2b544",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Figure({
  view,
  volume,
  active,
  onPick,
}: {
  view: BodyView;
  volume: MuscleVolume;
  active: MuscleGroup | null;
  onPick: (muscle: MuscleGroup | null) => void;
}) {
  const regions = BODY_REGIONS[view];
  return (
    <svg
      viewBox={BODY_VIEWBOX}
      className="h-auto w-full"
      role="img"
      aria-label={`${view === "front" ? "Front" : "Back"} view. Values are in the table below.`}
    >
      {BODY_OUTLINE[view].map((points, i) => (
        <polygon key={`o${i}`} points={points} fill="var(--color-surface-raised)" opacity={0.55} />
      ))}
      {(Object.entries(regions) as [MuscleGroup, readonly string[]][]).map(([muscle, polys]) =>
        polys.map((points, i) => (
          <polygon
            key={`${muscle}${i}`}
            data-muscle={muscle}
            points={points}
            fill={STEP_FILL[volumeStep(volume[muscle] ?? 0)]}
            stroke={active === muscle ? "var(--color-ink)" : "var(--color-canvas)"}
            strokeWidth={active === muscle ? 1.6 : 0.6}
            className="cursor-pointer"
            onClick={() => onPick(active === muscle ? null : muscle)}
          >
            <title>{`${MUSCLE_LABELS[muscle]}: ${fmt(volume[muscle] ?? 0)} sets`}</title>
          </polygon>
        )),
      )}
    </svg>
  );
}

export function BodyMap({ volume, totalSets }: { volume: MuscleVolume; totalSets: number }) {
  const [active, setActive] = useState<MuscleGroup | null>(null);
  const trained = MUSCLE_GROUPS.filter((m) => (volume[m] ?? 0) > 0).sort(
    (a, b) => volume[b] - volume[a],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Figure view="front" volume={volume} active={active} onPick={setActive} />
        <Figure view="back" volume={volume} active={active} onPick={setActive} />
      </div>

      <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {[...VOLUME_BANDS].reverse().map((band) => (
          <li key={band.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: STEP_FILL[band.step as VolumeStep] }}
              aria-hidden
            />
            {band.label}
          </li>
        ))}
      </ul>

      {active && (
        <p role="status" className="text-center text-sm">
          <span className="font-medium">{MUSCLE_LABELS[active]}</span>
          <span className="text-ink-muted"> · {fmt(volume[active] ?? 0)} sets this week</span>
        </p>
      )}

      <div className="overflow-hidden rounded-card border border-line">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line bg-surface-raised text-xs text-ink-muted">
              <th className="px-3 py-2 font-medium">Muscle</th>
              <th className="px-3 py-2 text-right font-medium">Sets</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line font-medium">
              <td className="px-3 py-2">Total working sets</td>
              <td className="px-3 py-2 text-right">{fmt(totalSets)}</td>
            </tr>
            {trained.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-ink-muted">
                  No sets logged this week.
                </td>
              </tr>
            )}
            {trained.map((muscle) => (
              <tr
                key={muscle}
                className={cn(
                  "cursor-pointer border-b border-line last:border-0",
                  active === muscle && "bg-surface-raised",
                )}
                onClick={() => setActive(active === muscle ? null : muscle)}
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: STEP_FILL[volumeStep(volume[muscle])] }}
                      aria-hidden
                    />
                    {MUSCLE_LABELS[muscle]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{fmt(volume[muscle])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-subtle">
        A working set counts once for each primary muscle and half for each secondary one. Warm-ups
        are excluded. Only finished workouts count.
      </p>
    </div>
  );
}
