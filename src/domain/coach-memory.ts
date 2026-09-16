import { z } from "zod";

export const MEMORY_LIMITS = {
  items: 40,
  words: 3000,
  characters: 40_000,
  itemCharacters: 2000,
} as const;
export const evidenceIdSchema = z.string().refine((value) => {
  const [prefix, id, extra] = value.split(":");
  return (
    extra === undefined &&
    ["workout", "exercise", "run", "recovery", "attachment", "intake", "job", "note"].includes(
      prefix ?? "",
    ) &&
    z.uuid().safeParse(id).success
  );
}, "Use a source type followed by its UUID.");
export const sourceQuoteSchema = z.object({
  sourceId: evidenceIdSchema,
  text: z.string().trim().min(1).max(MEMORY_LIMITS.itemCharacters),
});
export type MemorySourceQuote = z.infer<typeof sourceQuoteSchema>;
export type AthleteSource = { text: string; createdAt: string };
export const memoryItemSchema = z.object({
  id: z.uuid(),
  category: z.enum(["preference", "trend", "observation", "experiment", "decision"]),
  text: z.string().trim().min(1).max(MEMORY_LIMITS.itemCharacters),
  status: z.enum(["confirmed", "reported", "observation", "hypothesis"]),
  sport: z.enum(["general", "workout", "run"]).optional(),
  sourceIds: z.array(evidenceIdSchema).max(10).default([]),
  /** Direct athlete words, distinguished from the coach's interpretation. */
  sourceQuote: sourceQuoteSchema.optional(),
  reviewAfter: z.iso.date().nullable(),
});
export type MemoryItemInput = z.infer<typeof memoryItemSchema>;
export type MemoryItem = MemoryItemInput & { origin: "athlete" | "coach"; updatedAt: string };

/**
 * Sources that are the athlete speaking, rather than the app measuring.
 *
 * Only these can support a remembered preference or correct one. A note sent from Tell the
 * coach is the obvious one; a note written on the finish screen or against a single exercise
 * is the same act performed somewhere more useful, at the moment it was true, and counts the
 * same. Confirmed intake answers are athlete text too, but they are a brief rather than a
 * message, so they may be quoted and never used to overturn a later statement.
 */
const ATHLETE_TEXT_PREFIXES = ["note", "workout", "exercise"] as const;
export const isAthleteTextSource = (sourceId: string) =>
  ATHLETE_TEXT_PREFIXES.some((prefix) => sourceId.startsWith(`${prefix}:`));

/** Two items hold the same athlete statement when they quote the same words from one source. */
const quoteKey = (item: Pick<MemoryItemInput, "sourceQuote">) =>
  item.sourceQuote ? JSON.stringify([item.sourceQuote.sourceId, item.sourceQuote.text]) : null;

/**
 * What became of a note, in the athlete's terms rather than the machine's.
 *
 * "Reviewed by coach" says a note was read, which is not the thing anyone wants to know. A
 * request that cannot be granted yet, one that is waiting for the next programme review, and
 * one that changed tomorrow's session all looked identical — like silence. Every note the
 * coach closes now names its outcome, and the two that leave the athlete waiting have to say
 * why in a sentence.
 */
export const NOTE_DISPOSITIONS = [
  "remembered",
  "applied",
  "queued_for_review",
  "no_action",
] as const;
export type NoteDisposition = (typeof NOTE_DISPOSITIONS)[number];
export const NOTE_DISPOSITION_LABELS: Record<NoteDisposition, string> = {
  remembered: "Remembered",
  applied: "Applied to your next session",
  queued_for_review: "Queued for your programme review",
  no_action: "No action",
};

export const reviewedNoteSchema = z
  .object({
    /** A bare UUID is a Tell the coach note; a training note names its own source type. */
    id: z.union([z.uuid().transform((id) => `note:${id}`), evidenceIdSchema]),
    disposition: z.enum(NOTE_DISPOSITIONS),
    detail: z.string().trim().max(200).default(""),
  })
  .refine((entry) => isAthleteTextSource(entry.id), "Only the athlete's own notes are reviewed.")
  .refine(
    (entry) => entry.detail.length > 0 || ["remembered", "applied"].includes(entry.disposition),
    "Say in one line why this note is waiting or was not acted on.",
  )
  .transform(({ id, disposition, detail }) => ({ sourceId: id, disposition, detail }));
export type ReviewedNote = z.infer<typeof reviewedNoteSchema>;

export const memoryPatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  upsert: z.array(memoryItemSchema).max(MEMORY_LIMITS.items).default([]),
  removeIds: z.array(z.uuid()).max(MEMORY_LIMITS.items).default([]),
  /** A new note can correct a protected fact without making the athlete edit the memo. */
  corrections: z
    .array(z.object({ itemId: z.uuid(), ...sourceQuoteSchema.shape }))
    .max(40)
    .default([]),
  reviewedNotes: z.array(reviewedNoteSchema).max(100).default([]),
});
export type MemoryPatch = z.infer<typeof memoryPatchSchema>;

export function memoryOverview(items: readonly MemoryItem[]) {
  return items.map((item) => `${item.category}: ${item.text}`).join("\n");
}

export function memoryWordCount(items: readonly Pick<MemoryItem, "text">[]) {
  return items.reduce((total, item) => total + item.text.split(/\s+/).filter(Boolean).length, 0);
}

/** A quote proves provenance, not truth or a diagnosis. */
export function validateMemoryQuote(
  quote: MemorySourceQuote,
  sources: ReadonlyMap<string, AthleteSource>,
) {
  const source = sources.get(quote.sourceId);
  if (!source || !source.text.includes(quote.text))
    throw new Error("Quote the athlete's exact words from an owned note or confirmed intake.");
  return source;
}

/** Item updates preserve unrelated facts; corrections need newer, attributable athlete input. */
export function mergeMemory(
  current: readonly MemoryItem[],
  patch: MemoryPatch,
  origin: MemoryItem["origin"],
  validSourceIds: ReadonlySet<string>,
  now: Date,
  athleteSources: ReadonlyMap<string, AthleteSource> = new Map(),
): MemoryItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  const writes = [...patch.removeIds, ...patch.upsert.map((item) => item.id)];
  if (new Set(writes).size !== writes.length) throw new Error("Update each memo item once.");
  const corrections = new Map(
    patch.corrections.map((correction) => [correction.itemId, correction]),
  );
  if (
    corrections.size !== patch.corrections.length ||
    patch.corrections.some((c) => !writes.includes(c.itemId))
  )
    throw new Error("Attach each correction to one memo item being changed.");
  if (origin === "coach") {
    // What the memo will hold once this patch lands, so a statement that survives under
    // another item can be told apart from one being dropped.
    const projected = new Map<string, MemoryItemInput>(byId);
    for (const id of patch.removeIds) projected.delete(id);
    for (const item of patch.upsert) projected.set(item.id, item);
    const carriedQuotes = new Set(
      [...projected.values()].map(quoteKey).filter((key): key is string => key !== null),
    );
    for (const id of writes) {
      const old = byId.get(id);
      if (!old || !(old.origin === "athlete" || old.status === "reported")) continue;
      // An expired, time-limited report can be retired without claiming the preference changed.
      if (
        old.origin === "coach" &&
        old.reviewAfter &&
        old.reviewAfter <= now.toISOString().slice(0, 10) &&
        patch.removeIds.includes(id)
      )
        continue;
      const oldQuote = quoteKey(old);
      const replacement = projected.get(id);
      // Rewording is not revision. While an item still quotes the same words at the same
      // standing, the coach owns the sentence and may tighten it, retitle it or file it under
      // another category without the athlete having to say the whole thing again. Without this
      // a clumsy first draft was permanent, and the memo grew into a transcript of its own
      // edits — which is the opposite of a summary. The quote stays the anchor: change what is
      // quoted, or drop the quote, and the athlete's newer words are needed as before.
      if (
        replacement &&
        oldQuote &&
        old.status === "reported" &&
        replacement.status === "reported" &&
        quoteKey(replacement) === oldQuote &&
        replacement.sourceIds.includes(old.sourceQuote!.sourceId)
      )
        continue;
      // Folding two items about one subject into one is the same reasoning: nothing is lost
      // while the athlete's words survive somewhere in the memo.
      if (!replacement && oldQuote && carriedQuotes.has(oldQuote)) continue;
      const correction = corrections.get(id);
      if (!correction || !isAthleteTextSource(correction.sourceId))
        throw new Error(
          "Changing athlete-reported memory requires a correction from a newer athlete note.",
        );
      const source = validateMemoryQuote(correction, athleteSources);
      const previousReportAt = old.sourceQuote
        ? athleteSources.get(old.sourceQuote.sourceId)?.createdAt
        : null;
      if (source.createdAt <= (previousReportAt ?? old.updatedAt))
        throw new Error("Use a newer athlete note to correct remembered input.");
    }
  }
  for (const id of patch.removeIds) byId.delete(id);
  for (const item of patch.upsert) {
    if (origin === "coach") {
      if (item.status === "confirmed")
        throw new Error(
          "Confirmed is reserved for legacy athlete edits. Use reported with a source quote, or observation/hypothesis for an inference.",
        );
      if (!item.sourceIds.length || item.sourceIds.some((id) => !validSourceIds.has(id)))
        throw new Error("Each coach memo item needs existing evidence belonging to this athlete.");
      if (item.status === "reported") {
        if (!item.sourceQuote || !item.sourceIds.includes(item.sourceQuote.sourceId))
          throw new Error("Reported memory needs a source quote included in its evidence IDs.");
        validateMemoryQuote(item.sourceQuote, athleteSources);
      } else if (item.category === "preference") {
        throw new Error("Preferences must be reported by the athlete, with a source quote.");
      }
      if (
        (item.status !== "reported" && !item.reviewAfter) ||
        (item.reviewAfter !== null &&
          (item.reviewAfter <= now.toISOString().slice(0, 10) ||
            new Date(item.reviewAfter).getTime() > now.getTime() + 56 * 86_400_000))
      )
        throw new Error("Set a memo reassessment date within the next eight weeks.");
    }
    byId.set(item.id, { ...item, origin, updatedAt: now.toISOString() });
  }
  const items = [...byId.values()];
  const text = items.map((item) => item.text).join("\n");
  if (
    items.length > MEMORY_LIMITS.items ||
    text.length > MEMORY_LIMITS.characters ||
    memoryWordCount(items) > MEMORY_LIMITS.words
  )
    throw new Error(
      "Keep the memo within 40 items, 3,000 words and 40,000 characters. Preserve confirmed facts.",
    );
  return items;
}
