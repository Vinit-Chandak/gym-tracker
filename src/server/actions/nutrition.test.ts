import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/server/validation/form";
import type { CreateFoodDraft } from "@/server/validation/nutrition";

const USER = "00000000-0000-4000-8000-000000000001";
const FOOD = "00000000-0000-4000-8000-000000000002";
const SAVED = "00000000-0000-4000-8000-000000000003";
const ENTRY = "00000000-0000-4000-8000-000000000004";
const KEY = "00000000-0000-4000-8000-000000000009";

const mocks = vi.hoisted(() => ({
  logFood: vi.fn(),
  createFood: vi.fn(),
  saveLibraryMeal: vi.fn(),
  updateEntryAmount: vi.fn(),
  deleteEntry: vi.fn(),
  saveMeal: vi.fn(),
  logSavedMeal: vi.fn(),
  deleteSavedMeal: vi.fn(),
  updateFood: vi.fn(),
  deleteFood: vi.fn(),
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

import {
  AmountTooLargeError,
  EmptyMealError,
  EntryNotFoundError,
  FoodNameTakenError,
  SavedMealChangedError,
  SavedMealNameTakenError,
} from "@/server/repositories/nutrition";

import {
  createFoodAction,
  createLibraryFoodAction,
  deleteEntryAction,
  deleteFoodAction,
  deleteSavedMealAction,
  logFoodAction,
  logSavedMealAction,
  saveLibraryMealAction,
  saveMealAction,
  saveTargetsAction,
  updateEntryAction,
  updateFoodAction,
} from "./nutrition";

// 20:00 in UTC is already the 26th in Kolkata, which is whose day it is.
const TODAY = "2026-09-26";
const FIELDS = {
  name: "Oats",
  portionAmount: "100",
  unit: "g",
  kcal: "389",
  carbsG: "66,3",
  fatG: "",
  proteinG: "16.9",
};
const NEW_FOOD: CreateFoodDraft = {
  submissionKey: KEY,
  eatenOn: TODAY,
  meal: "breakfast",
  ...FIELDS,
  amount: "60",
};
const OATS = {
  name: "Oats",
  portionAmount: 100,
  unit: "g",
  kcal: 389,
  carbsG: 66.3,
  fatG: null,
  proteinG: 16.9,
};

function targetsForm(): FormData {
  const form = new FormData();
  form.set("dailyKcal", "2400");
  form.set("proteinPerKg", "1.8");
  form.set("fatPercent", "25");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date("2026-09-25T20:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it.each([undefined, "false", "someone-else@example.test"])(
  "allows every food action with the retired flag set to %s, refreshing every food screen",
  async (setting) => {
    vi.stubEnv("FOOD_TRACKING_ENABLED", setting);
    for (const result of [
      await logFoodAction({ eatenOn: TODAY, meal: "lunch", foodId: FOOD, amount: "200" }),
      await createFoodAction(NEW_FOOD),
      await updateEntryAction({ entryId: ENTRY, amount: "150" }),
      await deleteEntryAction(ENTRY),
      await saveMealAction({ eatenOn: TODAY, meal: "breakfast", name: "Usual" }),
      await logSavedMealAction({ eatenOn: TODAY, meal: "dinner", savedMealId: SAVED }),
      await deleteSavedMealAction(SAVED),
      await updateFoodAction({ foodId: FOOD, ...FIELDS }),
      await deleteFoodAction(FOOD),
      await createLibraryFoodAction({ submissionKey: KEY, ...FIELDS }),
      await saveLibraryMealAction({ name: "Usual", items: [{ foodId: FOOD, amount: "80" }] }),
    ]) {
      expect(result).toEqual({ ok: true });
    }
    expect(await saveTargetsAction(INITIAL_FORM_STATE, targetsForm())).toEqual({});
    // A food from My foods and a new one are both logged by `logFood`.
    expect(mocks.logFood).toHaveBeenCalledTimes(2);
    const { logFood: _both, submitFoodOnce: _receipt, ...writes } = mocks;
    for (const write of Object.values(writes)) expect(write).toHaveBeenCalledOnce();
    // Twelve changes, each refreshing the five screens food is shown on.
    expect(revalidatePath).toHaveBeenCalledTimes(60);
    expect(revalidatePath).toHaveBeenCalledWith("/food");
    expect(revalidatePath).toHaveBeenCalledWith("/food/[meal]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/food/targets");
    expect(revalidatePath).toHaveBeenCalledWith("/food/my-foods");
    expect(revalidatePath).toHaveBeenCalledWith("/food/my-foods/meals/[id]", "page");
    // Food has a tab of its own, so nothing on Today changes with it.
    expect(revalidatePath).not.toHaveBeenCalledWith("/today");
  },
);

it("logs a food from My foods in the meal and on the day the page was showing", async () => {
  const draft = { submissionKey: KEY, eatenOn: "2026-09-25", meal: "lunch" as const, foodId: FOOD };
  expect(await logFoodAction({ ...draft, amount: "200" })).toEqual({ ok: true });
  expect(mocks.logFood).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    { eatenOn: "2026-09-25", meal: "lunch" },
    { food: { id: FOOD }, amount: 200 },
  );
  // Wrapped in its receipt, so a retry after a lost reply logs it once.
  expect(mocks.submitFoodOnce).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    KEY,
    { kind: "log", ...draft, amount: 200 },
    expect.any(Function),
  );
});

it("keeps a new food in My foods by logging it", async () => {
  expect(await createFoodAction(NEW_FOOD)).toEqual({ ok: true });
  expect(mocks.logFood).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    { eatenOn: TODAY, meal: "breakfast" },
    { food: OATS, amount: 60 },
  );
});

it("refuses a day that has not come yet, before writing anything", async () => {
  const tomorrow = "2026-09-27";
  expect(
    await logFoodAction({ eatenOn: tomorrow, meal: "lunch", foodId: FOOD, amount: "1" }),
  ).toEqual({ ok: false, error: "Food cannot be logged for a day that has not come yet." });
  expect(await createFoodAction({ ...NEW_FOOD, eatenOn: tomorrow })).toMatchObject({ ok: false });
  expect(
    await logSavedMealAction({ eatenOn: tomorrow, meal: "dinner", savedMealId: SAVED }),
  ).toMatchObject({ ok: false });
  expect(mocks.logFood).not.toHaveBeenCalled();
  expect(mocks.logSavedMeal).not.toHaveBeenCalled();
});

it("answers what was typed against its field, and keeps the sheet's work", async () => {
  expect(await createFoodAction({ ...NEW_FOOD, kcal: "", amount: "" })).toEqual({
    ok: false,
    fieldErrors: { kcal: "Enter the kcal.", amount: "Enter how much." },
  });
  mocks.logFood.mockRejectedValueOnce(new FoodNameTakenError("Oats"));
  expect(await createFoodAction(NEW_FOOD)).toEqual({
    ok: false,
    fieldErrors: { name: "You already have a food called Oats." },
  });
  mocks.updateEntryAmount.mockRejectedValueOnce(new AmountTooLargeError("kcal"));
  expect(await updateEntryAction({ entryId: ENTRY, amount: "9000" })).toEqual({
    ok: false,
    fieldErrors: { amount: "That comes to more than 10,000 kcal." },
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("says in words what is gone, and what went wrong without a reason to give", async () => {
  mocks.updateEntryAmount.mockRejectedValueOnce(new EntryNotFoundError());
  expect(await updateEntryAction({ entryId: ENTRY, amount: "1" })).toEqual({
    ok: false,
    error: "That food is no longer in this meal.",
  });
  mocks.saveMeal.mockRejectedValueOnce(new EmptyMealError());
  expect(await saveMealAction({ eatenOn: TODAY, meal: "lunch", name: "Nothing" })).toEqual({
    ok: false,
    error: "There is nothing in this meal to save.",
  });
  mocks.logFood.mockRejectedValueOnce(new Error("connection reset"));
  expect(await logFoodAction({ eatenOn: TODAY, meal: "lunch", foodId: FOOD, amount: "1" })).toEqual(
    { ok: false, error: "Something went wrong. Please try again." },
  );
  expect(
    await logSavedMealAction({ eatenOn: TODAY, meal: "lunch", savedMealId: "not-an-id" }),
  ).toEqual({ ok: false, error: "That saved meal no longer exists." });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("stars a meal under its name, and adds a saved meal where it is asked for", async () => {
  expect(
    await saveMealAction({ eatenOn: TODAY, meal: "breakfast", name: " Usual breakfast " }),
  ).toEqual({ ok: true });
  expect(mocks.saveMeal).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    { eatenOn: TODAY, meal: "breakfast" },
    "Usual breakfast",
  );
  expect(await logSavedMealAction({ eatenOn: TODAY, meal: "dinner", savedMealId: SAVED })).toEqual({
    ok: true,
  });
  expect(mocks.logSavedMeal).toHaveBeenCalledWith(expect.anything(), USER, SAVED, {
    eatenOn: TODAY,
    meal: "dinner",
  });
});

it("treats taking away something already gone as done", async () => {
  for (const action of [deleteEntryAction, deleteSavedMealAction, deleteFoodAction]) {
    expect(await action("not-an-id")).toEqual({ ok: true });
  }
  expect(mocks.deleteEntry).not.toHaveBeenCalled();
  expect(mocks.deleteSavedMeal).not.toHaveBeenCalled();
  expect(mocks.deleteFood).not.toHaveBeenCalled();
});

it("corrects a food with what its sheet holds", async () => {
  expect(await updateFoodAction({ foodId: FOOD, ...FIELDS, name: "Rolled oats" })).toEqual({
    ok: true,
  });
  expect(mocks.updateFood).toHaveBeenCalledWith(expect.anything(), USER, FOOD, {
    ...OATS,
    name: "Rolled oats",
  });
});

it("saves the targets from the form", async () => {
  expect(await saveTargetsAction(INITIAL_FORM_STATE, targetsForm())).toEqual({});
  expect(mocks.saveNutritionTargets).toHaveBeenCalledWith(expect.anything(), USER, {
    dailyKcal: 2400,
    proteinPerKg: 1.8,
    fatPercent: 25,
  });
  expect(revalidatePath).toHaveBeenCalledTimes(5);
  mocks.saveNutritionTargets.mockRejectedValueOnce(new Error("down"));
  expect(await saveTargetsAction(INITIAL_FORM_STATE, targetsForm())).toEqual({
    formError: "Something went wrong. Please try again.",
    values: { dailyKcal: "2400", proteinPerKg: "1.8", fatPercent: "25" },
  });
});

it("keeps a food in My foods without a day or a meal, once for a retried key", async () => {
  expect(await createLibraryFoodAction({ submissionKey: KEY, ...FIELDS })).toEqual({ ok: true });
  expect(mocks.createFood).toHaveBeenCalledWith(expect.anything(), USER, OATS);
  expect(mocks.submitFoodOnce).toHaveBeenCalledWith(
    expect.anything(),
    USER,
    KEY,
    expect.objectContaining({ kind: "library-food" }),
    expect.any(Function),
  );
  mocks.createFood.mockRejectedValueOnce(new FoodNameTakenError("Oats"));
  expect(await createLibraryFoodAction({ ...FIELDS })).toEqual({
    ok: false,
    fieldErrors: { name: "You already have a food called Oats." },
  });
});

it("saves a meal built in My foods, new with a receipt and changed without one", async () => {
  const items = [
    { foodId: FOOD, amount: "80" },
    { keep: 0, amount: "1" },
  ];
  expect(await saveLibraryMealAction({ submissionKey: KEY, name: " Usual ", items })).toEqual({
    ok: true,
  });
  expect(mocks.saveLibraryMeal).toHaveBeenLastCalledWith(expect.anything(), USER, {
    id: undefined,
    name: "Usual",
    items: [
      { foodId: FOOD, amount: 80 },
      { keep: 0, amount: 1 },
    ],
  });
  expect(mocks.submitFoodOnce).toHaveBeenCalledTimes(1);
  expect(await saveLibraryMealAction({ savedMealId: SAVED, name: "Usual", items })).toEqual({
    ok: true,
  });
  expect(mocks.saveLibraryMeal).toHaveBeenLastCalledWith(
    expect.anything(),
    USER,
    expect.objectContaining({ id: SAVED }),
  );
  // A change to a meal that exists is the same change however often it is sent.
  expect(mocks.submitFoodOnce).toHaveBeenCalledTimes(1);
});

it("says what stops a meal from being saved, against the name or in words", async () => {
  expect(await saveLibraryMealAction({ name: "", items: [] })).toEqual({
    ok: false,
    fieldErrors: { name: "Name this meal.", items: "Add a food to this meal." },
  });
  mocks.saveLibraryMeal.mockRejectedValueOnce(new SavedMealNameTakenError("Usual"));
  expect(
    await saveLibraryMealAction({ name: "Usual", items: [{ foodId: FOOD, amount: "1" }] }),
  ).toEqual({ ok: false, fieldErrors: { name: "You already have a meal called Usual." } });
  mocks.saveLibraryMeal.mockRejectedValueOnce(new SavedMealChangedError());
  expect(
    await saveLibraryMealAction({
      savedMealId: SAVED,
      name: "Usual",
      items: [{ keep: 4, amount: "1" }],
    }),
  ).toEqual({ ok: false, error: new SavedMealChangedError().message });
});
