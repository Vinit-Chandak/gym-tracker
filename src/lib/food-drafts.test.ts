// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { readFoodDrafts, removeFoodDraft, saveFoodDraft, type FoodLocalDraft } from "./food-drafts";
const draft: FoodLocalDraft = {
  userId: "alice",
  submissionKey: "00000000-0000-4000-8000-000000000001",
  eatenOn: "2026-09-24",
  name: "Dinner",
  starred: false,
  items: [{ name: "Toast", kcal: "", carbsG: "", fatG: "", proteinG: "" }],
};
beforeEach(() => localStorage.clear());
it("restores unfinished fields, original date and retry identity only for their account", () => {
  saveFoodDraft(localStorage, draft);
  expect(readFoodDrafts(localStorage, "alice")).toEqual([draft]);
  expect(readFoodDrafts(localStorage, "bob")).toEqual([]);
  removeFoodDraft(localStorage, readFoodDrafts(localStorage, "alice")[0]!);
  expect(localStorage.length).toBe(0);
});
it("does not erase a newer version from another tab when acknowledging an older save", () => {
  saveFoodDraft(localStorage, { ...draft, name: "Newer dinner" });
  removeFoodDraft(localStorage, draft);
  expect(readFoodDrafts(localStorage, "alice")[0]?.name).toBe("Newer dinner");
});
it("ignores malformed and cross-account payloads without deleting them", () => {
  const key = `overload:food-draft:v1:alice:${draft.submissionKey}`;
  for (const value of [
    "{broken",
    JSON.stringify({ ...draft, userId: "bob" }),
    JSON.stringify({ ...draft, eatenOn: "2026-02-31" }),
  ]) {
    localStorage.setItem(key, value);
    expect(readFoodDrafts(localStorage, "alice")).toEqual([]);
    expect(localStorage.getItem(key)).toBe(value);
  }
});
it("reports unavailable storage instead of claiming the draft is durable", () => {
  expect(() =>
    saveFoodDraft(
      {
        ...localStorage,
        setItem: () => {
          throw new Error("full");
        },
      },
      draft,
    ),
  ).toThrow("full");
});
