import { describe, expect, it } from "vitest";

import { MUSCLE_GROUPS, type MuscleGroup } from "@/domain/types";

import { BODY_REGIONS } from "./body-regions";

const points = (poly: string): [number, number][] => {
  const n = poly.split(/\s+/).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i]!, n[i + 1]!]);
  return out;
};

const inside = (pt: [number, number], poly: [number, number][]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
};

describe("body map regions", () => {
  it("draws every muscle group the app can record", () => {
    for (const muscle of MUSCLE_GROUPS) {
      const polys = [...(BODY_REGIONS.front[muscle] ?? []), ...(BODY_REGIONS.back[muscle] ?? [])];
      expect(polys.length, `${muscle} has no region on either view`).toBeGreaterThan(0);
      for (const poly of polys) {
        expect(points(poly).length, `${muscle} has a degenerate polygon`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("names no muscle the app does not have", () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    for (const view of ["front", "back"] as const) {
      for (const muscle of Object.keys(BODY_REGIONS[view])) {
        expect(known.has(muscle), `${view}: unknown muscle ${muscle}`).toBe(true);
      }
    }
  });

  it("keeps regions disjoint, so highlighting one muscle can never tint another", () => {
    for (const view of ["front", "back"] as const) {
      const groups = Object.entries(BODY_REGIONS[view]) as [MuscleGroup, readonly string[]][];
      const shapes = groups.map(([m, polys]) => [m, polys.map(points)] as const);
      const clashes: string[] = [];
      // A coarse sweep is enough: overlaps big enough to see are far wider than the step.
      for (let x = 0; x < 100; x += 1) {
        for (let y = 0; y < 225; y += 1) {
          const hit = shapes.filter(([, ps]) => ps.some((p) => inside([x, y], p))).map(([m]) => m);
          if (hit.length > 1) clashes.push(`${view} (${x},${y}): ${hit.join(" + ")}`);
        }
      }
      expect(clashes.slice(0, 5)).toEqual([]);
    }
  });
});
