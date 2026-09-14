import { expect, it } from "vitest";
import {
  MEMORY_LIMITS,
  memoryItemSchema,
  memoryPatchSchema,
  memoryWordCount,
  mergeMemory,
  type MemoryItem,
} from "./coach-memory";

const now = new Date("2026-09-14T12:00:00Z");
const source = `workout:${crypto.randomUUID()}`;
const item = () =>
  memoryItemSchema.parse({
    id: crypto.randomUUID(),
    category: "observation",
    text: "Rows improve with a longer rest.",
    status: "observation",
    sourceIds: [source],
    reviewAfter: "2026-09-28",
  });
const patch = (upsert = [item()], removeIds: string[] = []) =>
  memoryPatchSchema.parse({ expectedRevision: 0, upsert, removeIds });

it("preserves unrelated and athlete-confirmed items when the coach updates one observation", () => {
  const confirmed: MemoryItem = {
    ...item(),
    category: "preference",
    status: "confirmed",
    text: "Prefer dumbbells.",
    origin: "athlete",
    updatedAt: now.toISOString(),
  };
  const next = mergeMemory([confirmed], patch(), "coach", new Set([source]), now);
  expect(next).toHaveLength(2);
  expect(next[0]).toEqual(confirmed);
  expect(() =>
    mergeMemory(next, patch([], [confirmed.id]), "coach", new Set([source]), now),
  ).toThrow(/only.*athlete/);
  expect(() =>
    mergeMemory(next, patch([{ ...item(), id: confirmed.id }]), "coach", new Set([source]), now),
  ).toThrow(/only.*athlete/);
});
it("requires provenance, a future review date and an honest status for coach claims", () => {
  expect(() => mergeMemory([], patch(), "coach", new Set(), now)).toThrow(/existing evidence/);
  expect(() =>
    mergeMemory(
      [],
      patch([{ ...item(), reviewAfter: "2026-09-14" }]),
      "coach",
      new Set([source]),
      now,
    ),
  ).toThrow(/reassessment/);
  expect(() =>
    mergeMemory(
      [],
      patch([{ ...item(), reviewAfter: "2027-01-01" }]),
      "coach",
      new Set([source]),
      now,
    ),
  ).toThrow(/reassessment/);
  expect(() =>
    mergeMemory([], patch([{ ...item(), status: "confirmed" }]), "coach", new Set([source]), now),
  ).toThrow(/Confirmed/);
});
it("rejects budget overflow without silently dropping prior facts", () => {
  const current = Array.from({ length: MEMORY_LIMITS.items }, () => ({
    ...item(),
    origin: "coach" as const,
    updatedAt: now.toISOString(),
  }));
  expect(() => mergeMemory(current, patch(), "coach", new Set([source]), now)).toThrow(/40 items/);
  expect(current).toHaveLength(MEMORY_LIMITS.items);
});
it("accepts 3,000 words across short items and rejects one additional word without losing facts", () => {
  const entries = Array.from({ length: 40 }, () => ({
    ...item(),
    text: Array.from({ length: 75 }, () => "training").join(" "),
  }));
  const current = mergeMemory([], patch(entries), "coach", new Set([source]), now);
  expect(memoryWordCount(current)).toBe(3000);
  expect(() =>
    mergeMemory(
      current,
      patch([{ ...entries[0]!, text: entries[0]!.text + " extra" }]),
      "coach",
      new Set([source]),
      now,
    ),
  ).toThrow(/3,000 words/);
  expect(memoryWordCount(current)).toBe(3000);
});
it("lets athletes correct a coach observation and keeps that correction protected", () => {
  const prior: MemoryItem = { ...item(), origin: "coach", updatedAt: now.toISOString() };
  const corrected = {
    ...prior,
    status: "confirmed" as const,
    text: "Shorter rest suits me.",
    sourceIds: [],
    reviewAfter: null,
  };
  const [saved] = mergeMemory([prior], patch([corrected]), "athlete", new Set(), now);
  expect(saved).toMatchObject({ origin: "athlete", status: "confirmed", text: corrected.text });
});
