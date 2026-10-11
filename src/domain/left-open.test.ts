import { expect, it } from "vitest";

import { finishedAsOf, isLeftOpen, LEFT_OPEN_MS, lastTrainedAt } from "./left-open";

const startedAt = new Date("2026-10-10T13:00:00.000Z");
const lastSetAt = new Date("2026-10-10T14:00:00.000Z");
const after = (from: Date, ms: number) => new Date(from.getTime() + ms);

it("counts six hours from the last set, or from the start before any", () => {
  expect(lastTrainedAt(startedAt, lastSetAt)).toBe(lastSetAt);
  expect(lastTrainedAt(startedAt, null)).toBe(startedAt);
  expect(isLeftOpen(startedAt, lastSetAt, after(lastSetAt, LEFT_OPEN_MS))).toBe(false);
  expect(isLeftOpen(startedAt, lastSetAt, after(lastSetAt, LEFT_OPEN_MS + 60_000))).toBe(true);
  expect(isLeftOpen(startedAt, null, after(startedAt, LEFT_OPEN_MS + 60_000))).toBe(true);
});

it("ends a workout left open at its last set, and one still being trained now", () => {
  const morning = new Date("2026-10-11T03:00:00.000Z");
  expect(finishedAsOf(lastSetAt, morning)).toBe(lastSetAt);
  const soon = after(lastSetAt, 20 * 60_000);
  expect(finishedAsOf(lastSetAt, soon)).toBe(soon);
  expect(finishedAsOf(null, morning)).toBe(morning);
});
