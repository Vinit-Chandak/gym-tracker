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
    ["workout", "exercise", "run", "recovery", "attachment", "intake", "job"].includes(
      prefix ?? "",
    ) &&
    z.uuid().safeParse(id).success
  );
}, "Use a source type followed by its UUID.");
export const memoryItemSchema = z.object({
  id: z.uuid(),
  category: z.enum(["preference", "trend", "observation", "experiment", "decision"]),
  text: z.string().trim().min(1).max(MEMORY_LIMITS.itemCharacters),
  status: z.enum(["confirmed", "observation", "hypothesis"]),
  sourceIds: z.array(evidenceIdSchema).max(10).default([]),
  reviewAfter: z.iso.date().nullable(),
});
export type MemoryItemInput = z.infer<typeof memoryItemSchema>;
export type MemoryItem = MemoryItemInput & { origin: "athlete" | "coach"; updatedAt: string };
export const memoryPatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  upsert: z.array(memoryItemSchema).max(MEMORY_LIMITS.items).default([]),
  removeIds: z.array(z.uuid()).max(MEMORY_LIMITS.items).default([]),
});
export type MemoryPatch = z.infer<typeof memoryPatchSchema>;

export function memoryOverview(items: readonly MemoryItem[]) {
  return items.map((item) => `${item.category}: ${item.text}`).join("\n");
}

export function memoryWordCount(items: readonly Pick<MemoryItem, "text">[]) {
  return items.reduce((total, item) => total + item.text.split(/\s+/).filter(Boolean).length, 0);
}

/** Item updates preserve unrelated facts; the coach cannot overwrite athlete-authored items. */
export function mergeMemory(
  current: readonly MemoryItem[],
  patch: MemoryPatch,
  origin: MemoryItem["origin"],
  validSourceIds: ReadonlySet<string>,
  now: Date,
): MemoryItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  const writes = [...patch.removeIds, ...patch.upsert.map((item) => item.id)];
  if (new Set(writes).size !== writes.length) throw new Error("Update each memo item once.");
  if (origin === "coach" && writes.some((id) => byId.get(id)?.origin === "athlete"))
    throw new Error("Athlete-confirmed memo items can only be changed by the athlete.");
  for (const id of patch.removeIds) byId.delete(id);
  for (const item of patch.upsert) {
    if (origin === "coach") {
      if (item.status === "confirmed" || item.category === "preference")
        throw new Error(
          "Confirmed preferences belong to athlete input. Coach interpretations must stay observations or hypotheses.",
        );
      if (!item.sourceIds.length || item.sourceIds.some((id) => !validSourceIds.has(id)))
        throw new Error("Each coach memo item needs existing evidence belonging to this athlete.");
      if (
        !item.reviewAfter ||
        item.reviewAfter <= now.toISOString().slice(0, 10) ||
        new Date(item.reviewAfter).getTime() > now.getTime() + 56 * 86_400_000
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
