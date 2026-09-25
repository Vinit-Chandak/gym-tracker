import { z } from "zod";
import { NUTRITION_LIMITS } from "@/domain/nutrition";

const prefix = "overload:food-draft:v1:";
const changed = "overload:food-drafts-changed";
const text = z.string().max(200);
const draftSchema = z.object({
  userId: z.string(),
  submissionKey: z.uuid(),
  mealId: z.uuid().optional(),
  eatenOn: z.iso.date(),
  name: text,
  starred: z.boolean(),
  items: z
    .array(z.object({ name: text, kcal: text, carbsG: text, fatG: text, proteinG: text }))
    .min(1)
    .max(NUTRITION_LIMITS.itemsPerMeal),
});
export type FoodLocalDraft = z.infer<typeof draftSchema>;
type Store = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
const key = (userId: string, id: string) => `${prefix}${userId}:${id}`;

export function readFoodDrafts(store: Store, userId: string): FoodLocalDraft[] {
  const drafts: FoodLocalDraft[] = [];
  for (let i = 0; i < store.length; i++) {
    const name = store.key(i);
    if (!name?.startsWith(`${prefix}${userId}:`)) continue;
    try {
      const result = draftSchema.safeParse(JSON.parse(store.getItem(name) ?? "null"));
      if (
        result.success &&
        result.data.userId === userId &&
        name === key(userId, result.data.submissionKey)
      )
        drafts.push(result.data);
    } catch {
      /* Keep an unreadable draft untouched; never load another account's values. */
    }
  }
  return drafts;
}

export function saveFoodDraft(store: Store, draft: FoodLocalDraft): void {
  store.setItem(key(draft.userId, draft.submissionKey), JSON.stringify(draft));
}

export function removeFoodDraft(store: Store, draft: FoodLocalDraft): void {
  // A different tab may have continued editing this draft while a save was in flight.
  const name = key(draft.userId, draft.submissionKey);
  const stored = draftSchema.safeParse(JSON.parse(store.getItem(name) ?? "null"));
  if (stored.success && JSON.stringify(stored.data) === JSON.stringify(draftSchema.parse(draft)))
    store.removeItem(name);
}

export function notifyFoodDrafts(): void {
  window.dispatchEvent(new Event(changed));
}
export function subscribeFoodDrafts(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changed, listener);
  };
}
export function foodDraftSnapshot(userId?: string): string {
  if (!userId) return "[]";
  try {
    return JSON.stringify(readFoodDrafts(localStorage, userId));
  } catch {
    return "[]";
  }
}
