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

import { Disclosure } from "./disclosure";
import { BODY_OUTLINE, BODY_REGIONS, BODY_VIEWBOX, type BodyView } from "./body-regions";

/**
 * The highlighter laid down in passes: one hue in five ordered steps, the sequential ramp a
 * magnitude scale wants, so the heaviest week reads as the most highlighted. The values come
 * from the theme and keep their order on either sheet. Step 0 is the untrained body. The
 * bands are labelled and repeated in the table, so the colour is never the only cue.
 */
const STEP_FILL: Record<VolumeStep, string> = {
  0: "var(--ov-volume-0)",
  1: "var(--ov-volume-1)",
  2: "var(--ov-volume-2)",
  3: "var(--ov-volume-3)",
  4: "var(--ov-volume-4)",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * One view of the figure, drawn like a printed anatomical chart: every region a hairline
 * outline filled with its band of the highlighter, the head and joints outlined only. The
 * chosen muscle is drawn last, in the pen, so its edge sits over its neighbours'.
 */
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
  const regions = Object.entries(BODY_REGIONS[view]) as [MuscleGroup, readonly string[]][];
  const ordered = [
    ...regions.filter(([muscle]) => muscle !== active),
    ...regions.filter(([muscle]) => muscle === active),
  ];
  return (
    <svg
      viewBox={BODY_VIEWBOX}
      className="h-auto w-full"
      role="img"
      aria-label={`${view === "front" ? "Front" : "Back"} view. Values are in the table below.`}
    >
      {BODY_OUTLINE[view].map((points, i) => (
        <polygon
          key={`o${i}`}
          points={points}
          fill="none"
          stroke="var(--ov-line-strong)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      ))}
      {ordered.map(([muscle, polys]) =>
        polys.map((points, i) => (
          <polygon
            key={`${muscle}${i}`}
            data-muscle={muscle}
            points={points}
            fill={STEP_FILL[volumeStep(volume[muscle] ?? 0)]}
            stroke={active === muscle ? "var(--ov-pen)" : "var(--ov-line-strong)"}
            strokeWidth={active === muscle ? 1.5 : 0.5}
            strokeLinejoin="round"
            className="cursor-pointer"
            onClick={() => onPick(active === muscle ? null : muscle)}
          >
            <title>{`${MUSCLE_LABELS[muscle]}: ${fmt(volume[muscle] ?? 0)} ${volume[muscle] === 1 ? "set" : "sets"}`}</title>
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
      <div className="mx-auto grid w-full max-w-lg grid-cols-2 gap-2">
        <Figure view="front" volume={volume} active={active} onPick={setActive} />
        <Figure view="back" volume={volume} active={active} onPick={setActive} />
      </div>

      {/* The scale, as five squares of the ramp with their bands written beside them. */}
      <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {[...VOLUME_BANDS].reverse().map((band) => (
          <li key={band.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              className="size-2.5 shrink-0 border border-line-strong"
              style={{ background: STEP_FILL[band.step as VolumeStep] }}
              aria-hidden
            />
            <span className="font-data tabular-nums">{band.label}</span>
          </li>
        ))}
      </ul>

      {active && (
        <p role="status" className="text-center text-sm">
          <span className="font-medium">{MUSCLE_LABELS[active]}</span>
          <span className="font-data text-ink-muted tabular-nums">
            {" "}
            · {fmt(volume[active] ?? 0)} sets this week
          </span>
        </p>
      )}

      {/* The per-muscle numbers fold away, so the map is what the section shows first. */}
      <Disclosure
        summary="Number of sets"
        meta={`${fmt(totalSets)} ${totalSets === 1 ? "set" : "sets"}`}
        variant="footer"
      >
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="py-2 font-medium">Muscle</th>
              <th className="py-2 text-right font-medium">Sets</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line font-medium">
              <td className="py-2">Total working sets</td>
              <td className="py-2 text-right font-data font-semibold">{fmt(totalSets)}</td>
            </tr>
            {trained.length === 0 && (
              <tr>
                <td colSpan={2} className="py-6 text-center text-ink-muted">
                  No sets logged this week.
                </td>
              </tr>
            )}
            {trained.map((muscle) => (
              <tr
                key={muscle}
                className={cn(
                  "cursor-pointer border-b border-line transition-colors duration-[var(--ov-duration-feedback)] last:border-0",
                  active === muscle && "bg-surface-raised",
                )}
                onClick={() => setActive(active === muscle ? null : muscle)}
              >
                <th scope="row" className="font-normal">
                  <button
                    type="button"
                    aria-pressed={active === muscle}
                    className="flex min-h-11 w-full items-center gap-2 py-2 text-left"
                  >
                    <span
                      className="size-2.5 shrink-0 border border-line-strong"
                      style={{ background: STEP_FILL[volumeStep(volume[muscle])] }}
                      aria-hidden
                    />
                    {MUSCLE_LABELS[muscle]}
                  </button>
                </th>
                <td className="py-2 text-right font-data font-semibold">{fmt(volume[muscle])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    </div>
  );
}
