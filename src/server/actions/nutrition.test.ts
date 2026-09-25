import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/server/validation/form";
import type { MealDraft } from "@/server/validation/nutrition";

const USER = "00000000-0000-4000-8000-000000000001";
const MEAL = "00000000-0000-4000-8000-000000000002";
const STAR = "00000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  createMeal: vi.fn(),
  updateMeal: vi.fn(),
  deleteMeal: vi.fn(),
  logSavedMeal: vi.fn(),
  deleteSavedMeal: vi.fn(),
  saveNutritionTargets: vi.fn(),
  submitFoodOnce: vi.fn(
    async (
      _db: unknown,
      _user: string,
      _key: string,
      _payload: unknown,
      write: () => Promise<unknown>,
    ) => write(),
  ),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: (_db: unknown, _userId: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: USER, email: "eater@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "Asia/Kolkata" }),
}));
vi.mock("@/server/repositories/nutrition", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/nutrition")>()),
  ...mocks,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { MealNotFoundError } from "@/server/repositories/nutrition";

import {
  deleteMealAction,
  deleteSavedMealAction,
  logSavedMealAction,
  saveMealAction,
  saveTargetsAction,
} from "./nutrition";

const DRAFT: MealDraft = {
  name: "Afternoon meal 1",
  items: [{ name: "Milk", kcal: "160", carbsG: "12", fatG: "8", proteinG: "8.5" }],
  starred: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  // 20:00 in UTC is already tomorrow in Kolkata, which is whose day it is.
  vi.useFakeTimers({ now: new Date("2026-09-25T20:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it.each([undefined, "false", "someone-else@example.test"])(
  "allows every food action with the retired flag set to %s",
  async (setting) => {
    vi.stubEnv("FOOD_TRACKING_ENABLED", setting);
    const form = new FormData();
    form.set("dailyKcal", "2400");
    form.set("split", "body_weight");
    form.set("proteinPerKg", "1.8");
    for (const result of [
      await saveMealAction(DRAFT),
      await deleteMealAction(MEAL),
      await logSavedMealAction(STAR),
      await deleteSavedMealAction(STAR),
    ]) {
      expect(result).toEqual({ ok: true });
    }
    expect(await saveTargetsAction(INITIAL_FORM_STATE, form)).toEqual({});
    for (const write of [
      mocks.createMeal,
      mocks.deleteMeal,
      mocks.logSavedMeal,
      mocks.deleteSavedMeal,
      mocks.saveNutritionTargets,
    ]) {
      expect(write).toHaveBeenCalledOnce();
    }
    expect(revalidatePath).toHaveBeenCalledTimes(10);
  },
);

it("logs a new meal on today in the account's own time zone", async () => {
  expect(await saveMealAction(DRAFT)).toEqual({ ok: true });
  expect(mocks.createMeal).toHaveBeenCalledWith(expect.anything(), USER, "2026-09-26", {
    name: "Afternoon meal 1",
    items: [{ name: "Milk", kcal: 160, carbsG: 12, fatG: 8, proteinG: 8.5 }],
    starred: true,
  });
  expect(revalidatePath).toHaveBeenCalledTimes(2);
  expect(revalidatePath).toHaveBeenCalledWith("/today");
  expect(revalidatePath).toHaveBeenCalledWith("/today/food");
});

it("rewrites the meal being edited rather than logging another", async () => {
  expect(await saveMealAction({ ...DRAFT, mealId: MEAL })).toEqual({ ok: true });
  expect(mocks.updateMeal).toHaveBeenCalledWith(expect.anything(), USER, MEAL, expect.anything());
  expect(mocks.createMeal).not.toHaveBeenCalled();
});

it("keeps a resumed draft's original day and wraps the write in its retry receipt", async () => {
  const key = "00000000-0000-4000-8000-000000000009";
  expect(await saveMealAction({ ...DRAFT, eatenOn: "2026-09-25", submissionKey: key })).toEqual({
    ok: true,
  });
  expect(mocks.submitFoodOnce).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    key,
    expect.objectContaining({ eatenOn: "2026-09-25" }),
    expect.any(Function),
  );
  expect(mocks.createMeal).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    "2026-09-25",
    expect.anything(),
  );
});

it("refuses invalid or future draft dates before writing", async () => {
  expect((await saveMealAction({ ...DRAFT, eatenOn: "2026-02-31" })).ok).toBe(false);
  expect(await saveMealAction({ ...DRAFT, eatenOn: "2026-09-27" })).toEqual({
    ok: false,
    error: "A meal cannot be logged for a future day.",
  });
  expect(mocks.createMeal).not.toHaveBeenCalled();
});

it("answers a mistake against its field, and a lost meal in words, keeping the sheet's work", async () => {
  expect(await saveMealAction({ ...DRAFT, items: [{ ...DRAFT.items[0]!, kcal: "" }] })).toEqual({
    ok: false,
    fieldErrors: { "items.0.kcal": "Enter the kcal." },
  });
  mocks.updateMeal.mockRejectedValueOnce(new MealNotFoundError());
  expect(await saveMealAction({ ...DRAFT, mealId: MEAL })).toEqual({
    ok: false,
    error: "That meal no longer exists.",
  });
  mocks.createMeal.mockRejectedValueOnce(new Error("connection reset"));
  expect(await saveMealAction(DRAFT)).toEqual({
    ok: false,
    error: "Something went wrong. Please try again.",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("adds a starred meal to today in one call", async () => {
  expect(await logSavedMealAction(STAR)).toEqual({ ok: true });
  expect(mocks.logSavedMeal).toHaveBeenCalledWith(expect.anything(), USER, STAR, "2026-09-26");
  expect(await logSavedMealAction("not-an-id")).toEqual({
    ok: false,
    error: "That starred meal no longer exists.",
  });
});

it("treats deleting something already gone as done", async () => {
  expect(await deleteMealAction("not-an-id")).toEqual({ ok: true });
  expect(await deleteSavedMealAction("not-an-id")).toEqual({ ok: true });
  expect(mocks.deleteMeal).not.toHaveBeenCalled();
  expect(await deleteMealAction(MEAL)).toEqual({ ok: true });
  expect(mocks.deleteMeal).toHaveBeenCalledWith(expect.anything(), USER, MEAL);
});

it("saves the targets from the form", async () => {
  const form = new FormData();
  form.set("dailyKcal", "2400");
  form.set("split", "body_weight");
  form.set("proteinPerKg", "1.8");
  expect(await saveTargetsAction(INITIAL_FORM_STATE, form)).toEqual({});
  expect(mocks.saveNutritionTargets).toHaveBeenCalledWith(expect.anything(), USER, {
    dailyKcal: 2400,
    proteinPerKg: 1.8,
    split: "body_weight",
  });
  expect(revalidatePath).toHaveBeenCalledTimes(2);
  expect(revalidatePath).toHaveBeenCalledWith("/today");
  expect(revalidatePath).toHaveBeenCalledWith("/today/food");
});
