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
  ).toThrow(/newer athlete note/);
  expect(() =>
    mergeMemory(next, patch([{ ...item(), id: confirmed.id }]), "coach", new Set([source]), now),
  ).toThrow(/newer athlete note/);
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

it("lets the coach remember a reported preference only with an exact athlete quote", () => {
  const note = `note:${crypto.randomUUID()}`;
  const sources = new Map([
    [note, { text: "I prefer dumbbells at home.", createdAt: now.toISOString() }],
  ]);
  const preference = memoryItemSchema.parse({
    ...item(),
    category: "preference",
    status: "reported",
    text: "Prefers dumbbells at home.",
    sourceIds: [note],
    sourceQuote: { sourceId: note, text: "I prefer dumbbells at home." },
    reviewAfter: null,
  });
  const saved = mergeMemory([], patch([preference]), "coach", new Set([note]), now, sources);
  expect(saved[0]).toMatchObject({ status: "reported", origin: "coach", reviewAfter: null });
  expect(() =>
    mergeMemory(
      [],
      patch([{ ...preference, sourceQuote: { sourceId: note, text: "I dislike running." } }]),
      "coach",
      new Set([note]),
      now,
      sources,
    ),
  ).toThrow(/exact words/);
  expect(() => mergeMemory([], patch([preference]), "coach", new Set([note]), now)).toThrow(
    /exact words/,
  );
});

it("requires a newer quoted note to correct or remove protected memory", () => {
  const old: MemoryItem = {
    ...item(),
    origin: "athlete",
    category: "preference",
    status: "confirmed",
    text: "Prefers machines.",
    updatedAt: new Date(now.getTime() - 86400_000).toISOString(),
  };
  const note = `note:${crypto.randomUUID()}`;
  const text = "Please forget the preference for machines. I now prefer dumbbells.";
  const sources = new Map([[note, { text, createdAt: now.toISOString() }]]);
  const corrected = memoryPatchSchema.parse({
    expectedRevision: 0,
    upsert: [
      {
        ...item(),
        id: old.id,
        category: "preference",
        status: "reported",
        text: "Prefers dumbbells.",
        sourceIds: [note],
        sourceQuote: { sourceId: note, text },
        reviewAfter: null,
      },
    ],
    corrections: [{ itemId: old.id, sourceId: note, text }],
  });
  expect(mergeMemory([old], corrected, "coach", new Set([note]), now, sources)[0]).toMatchObject({
    origin: "coach",
    text: "Prefers dumbbells.",
  });
  const removal = memoryPatchSchema.parse({
    expectedRevision: 0,
    removeIds: [old.id],
    corrections: corrected.corrections,
  });
  expect(mergeMemory([old], removal, "coach", new Set([note]), now, sources)).toEqual([]);
  sources.set(note, { text, createdAt: old.updatedAt });
  expect(() => mergeMemory([old], removal, "coach", new Set([note]), now, sources)).toThrow(
    /newer athlete note/,
  );
});

it("orders corrections by when the athlete spoke, even if an old report was summarized later", () => {
  const first = `note:${crypto.randomUUID()}`,
    second = `note:${crypto.randomUUID()}`;
  const firstText = "Prefer machines.",
    secondText = "Forget that; I prefer dumbbells.";
  const sourceTimes = new Map([
    [first, { text: firstText, createdAt: "2026-09-10T12:00:00Z" }],
    [second, { text: secondText, createdAt: "2026-09-11T12:00:00Z" }],
  ]);
  const old: MemoryItem = {
    ...item(),
    origin: "coach",
    status: "reported",
    category: "preference",
    sourceIds: [first],
    sourceQuote: { sourceId: first, text: firstText },
    reviewAfter: null,
    updatedAt: "2026-09-12T12:00:00Z",
  };
  const removal = memoryPatchSchema.parse({
    expectedRevision: 0,
    removeIds: [old.id],
    corrections: [{ itemId: old.id, sourceId: second, text: secondText }],
  });
  expect(mergeMemory([old], removal, "coach", new Set([first, second]), now, sourceTimes)).toEqual(
    [],
  );
});

it("lets the coach reword and merge its own items, but not change what they claim", () => {
  const note = `note:${crypto.randomUUID()}`;
  const said = "Weighted hyperextensions are fine now, I don't mind them.";
  const sources = new Map([[note, { text: said, createdAt: now.toISOString() }]]);
  const quote = { sourceId: note, text: said };
  const narrated = memoryItemSchema.parse({
    ...item(),
    category: "preference",
    status: "reported",
    text: "The athlete asked on 10 Sep not to be given weighted hyperextensions, then said on 14 Sep they may be included. The later note supersedes the restriction.",
    sourceIds: [note],
    sourceQuote: quote,
    reviewAfter: null,
  });
  const stored = mergeMemory([], patch([narrated]), "coach", new Set([note]), now, sources);

  // The fact, without the story of the fact, and without asking the athlete to say it again.
  const tidied = { ...narrated, text: "Weighted hyperextensions are allowed." };
  expect(
    mergeMemory(stored, patch([tidied]), "coach", new Set([note]), now, sources)[0],
  ).toMatchObject({ text: "Weighted hyperextensions are allowed." });

  // Recategorising is the same act; dropping the quote or changing it is not.
  expect(() =>
    mergeMemory(
      stored,
      patch([{ ...tidied, sourceQuote: undefined, sourceIds: [source] }]),
      "coach",
      new Set([source]),
      now,
      sources,
    ),
  ).toThrow(/newer athlete note/);
  expect(() =>
    mergeMemory(stored, patch([], [narrated.id]), "coach", new Set([note]), now, sources),
  ).toThrow(/newer athlete note/);

  // Folding two items about one subject into one keeps the athlete's words in the memo.
  const duplicate = memoryItemSchema.parse({ ...narrated, id: crypto.randomUUID() });
  const both = mergeMemory(stored, patch([duplicate]), "coach", new Set([note]), now, sources);
  expect(
    mergeMemory(both, patch([tidied], [duplicate.id]), "coach", new Set([note]), now, sources),
  ).toHaveLength(1);
});

it("closes a note with an outcome, and makes the waiting ones explain themselves", () => {
  const closed = memoryPatchSchema.parse({
    expectedRevision: 0,
    reviewedNotes: [
      { id: crypto.randomUUID(), disposition: "remembered" },
      { id: `exercise:${crypto.randomUUID()}`, disposition: "applied" },
      {
        id: `workout:${crypto.randomUUID()}`,
        disposition: "queued_for_review",
        detail: "Adding a slot needs your approval.",
      },
    ],
  });
  expect(closed.reviewedNotes.map((note) => note.id.split(":")[0])).toEqual([
    "note",
    "exercise",
    "workout",
  ]);
  expect(() =>
    memoryPatchSchema.parse({
      expectedRevision: 0,
      reviewedNotes: [{ id: crypto.randomUUID(), disposition: "no_action" }],
    }),
  ).toThrow(/why this note/);
  expect(() =>
    memoryPatchSchema.parse({
      expectedRevision: 0,
      reviewedNotes: [{ id: `run:${crypto.randomUUID()}`, disposition: "remembered" }],
    }),
  ).toThrow(/own notes/);
});

it("survives the second parse the memo write performs on an already-parsed result", () => {
  // The workflow route parses a result, then the memo write parses the patch again. A field
  // that renamed itself on the way through failed that second parse on every entry, so no note
  // could ever be closed; only an empty array got past it.
  const patch = {
    expectedRevision: 0,
    reviewedNotes: [
      { id: crypto.randomUUID(), disposition: "remembered" },
      { id: `workout:${crypto.randomUUID()}`, disposition: "applied" },
      { id: `exercise:${crypto.randomUUID()}`, disposition: "no_action", detail: "Already held." },
    ],
  };
  const once = memoryPatchSchema.parse(patch);
  expect(memoryPatchSchema.parse(once)).toEqual(once);
  expect(once.reviewedNotes.map((note) => note.id.split(":")[0])).toEqual([
    "note",
    "workout",
    "exercise",
  ]);
});

it("accepts a note written during training as the words behind a remembered preference", () => {
  const slot = `exercise:${crypto.randomUUID()}`;
  const said = "Bayesian curls felt much better than the cable version here.";
  const sources = new Map([[slot, { text: said, createdAt: now.toISOString() }]]);
  const preference = memoryItemSchema.parse({
    ...item(),
    category: "preference",
    status: "reported",
    text: "Prefers Bayesian curls to the cable version.",
    sourceIds: [slot],
    sourceQuote: { sourceId: slot, text: said },
    reviewAfter: null,
  });
  expect(
    mergeMemory([], patch([preference]), "coach", new Set([slot]), now, sources)[0],
  ).toMatchObject({ status: "reported", origin: "coach" });
});
