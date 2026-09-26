"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser, type SessionUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  AmountTooLargeError,
  createFood,
  deleteEntry,
  deleteFood,
  deleteSavedMeal,
  EmptyMealError,
  EntryNotFoundError,
  FoodNameTakenError,
  FoodNotFoundError,
  FoodSubmissionConflictError,
  logFood,
  logSavedMeal,
  SavedMealChangedError,
  SavedMealNameTakenError,
  SavedMealNotFoundError,
  SavedMealTooLargeError,
  saveLibraryMeal,
  saveMeal,
  saveNutritionTargets,
  submitFoodOnce,
  updateEntryAmount,
  updateFood,
} from "@/server/repositories/nutrition";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import {
  createFoodSchema,
  createLibraryFoodSchema,
  issuesByPath,
  logFoodSchema,
  logSavedMealSchema,
  saveLibraryMealSchema,
  saveMealSchema,
  targetsInputSchema,
  updateEntrySchema,
  updateFoodSchema,
  type CreateFoodDraft,
  type CreateLibraryFoodDraft,
  type LogFoodDraft,
  type LogSavedMealDraft,
  type SaveLibraryMealDraft,
  type SaveMealDraft,
  type UpdateEntryDraft,
  type UpdateFoodDraft,
} from "@/server/validation/nutrition";

/** An outcome, and for a sheet the messages to show against the fields they concern. */
export type FoodActionResult =
  { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

function describe(error: unknown): FoodActionResult {
  // What was typed is what is wrong: said against the field that holds it.
  if (error instanceof AmountTooLargeError) {
    return { ok: false, fieldErrors: { amount: error.message } };
  }
  if (error instanceof FoodNameTakenError || error instanceof SavedMealNameTakenError) {
    return { ok: false, fieldErrors: { name: error.message } };
  }
  if (
    error instanceof FoodNotFoundError ||
    error instanceof EntryNotFoundError ||
    error instanceof SavedMealNotFoundError ||
    error instanceof SavedMealChangedError ||
    error instanceof EmptyMealError ||
    error instanceof SavedMealTooLargeError ||
    error instanceof FoodSubmissionConflictError
  ) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Something went wrong. Please try again." };
}

function invalid(error: z.ZodError): FoodActionResult {
  return { ok: false, fieldErrors: issuesByPath(error.issues) };
}

/**
 * Every change here is shown on the Food tab and on the screens under it: a meal's page, My foods,
 * a meal in My foods and the targets. The tabs prefetch their data, so a refresh alone can reuse
 * an old Food snapshot: invalidate them all after a successful write.
 */
function refreshFood(): void {
  revalidatePath("/food");
  revalidatePath("/food/[meal]", "page");
  revalidatePath("/food/targets");
  revalidatePath("/food/my-foods");
  revalidatePath("/food/my-foods/meals/[id]", "page");
}

/**
 * Runs one change for the signed-in account.
 *
 * `eatenOn` is the day the page was showing, which stays its day past midnight; a day that has
 * not happened yet is refused. A `receipt` makes a retry after a lost reply harmless: a key
 * already committed with the same payload is a no-op.
 */
async function change(
  user: SessionUser,
  run: (tx: Tx) => Promise<unknown>,
  options: { eatenOn?: string; receipt?: { key?: string; payload: unknown } } = {},
): Promise<FoodActionResult> {
  try {
    if (options.eatenOn) {
      const profile = await getRequestProfile(user.id, user.email);
      if (options.eatenOn > todayInTimeZone(profile.timeZone)) {
        return { ok: false, error: "Food cannot be logged for a day that has not come yet." };
      }
    }
    const receipt = options.receipt;
    await withUser(getDb(), user.id, (tx) =>
      receipt?.key
        ? submitFoodOnce(tx, user.id, receipt.key, receipt.payload, () => run(tx))
        : run(tx),
    );
  } catch (error) {
    return describe(error);
  }
  refreshFood();
  return { ok: true };
}

export async function saveTargetsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(targetsInputSchema, formData);
  if (!parsed.success) return parsed.state;
  const outcome = await change(user, (tx) => saveNutritionTargets(tx, user.id, parsed.data));
  if (!outcome.ok) return { formError: outcome.error, values: formValues(formData) };
  return {};
}

/** Logs an amount of a food from My foods in a meal. */
export async function logFoodAction(draft: LogFoodDraft): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = logFoodSchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { submissionKey, eatenOn, meal, foodId, amount } = parsed.data;
  return change(
    user,
    (tx) => logFood(tx, user.id, { eatenOn, meal }, { food: { id: foodId }, amount }),
    { eatenOn, receipt: { key: submissionKey, payload: { kind: "log", ...parsed.data } } },
  );
}

/** Logs a new food in a meal, which is what keeps it in My foods. */
export async function createFoodAction(draft: CreateFoodDraft): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = createFoodSchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { submissionKey, eatenOn, meal, food, amount } = parsed.data;
  return change(user, (tx) => logFood(tx, user.id, { eatenOn, meal }, { food, amount }), {
    eatenOn,
    receipt: { key: submissionKey, payload: { kind: "create", ...parsed.data } },
  });
}

/** Changes how much of a food was eaten. */
export async function updateEntryAction(draft: UpdateEntryDraft): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = updateEntrySchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { entryId, amount } = parsed.data;
  return change(user, (tx) => updateEntryAmount(tx, user.id, entryId, amount));
}

/** Takes a food out of a meal. Taking out one already gone succeeds: gone is what was asked. */
export async function deleteEntryAction(entryId: string): Promise<FoodActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(entryId).success) return { ok: true };
  return change(user, (tx) => deleteEntry(tx, user.id, entryId));
}

/** Stars a meal: saves it as it stands, under a name, to be added again in one go. */
export async function saveMealAction(draft: SaveMealDraft): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = saveMealSchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { submissionKey, eatenOn, meal, name } = parsed.data;
  return change(user, (tx) => saveMeal(tx, user.id, { eatenOn, meal }, name), {
    receipt: { key: submissionKey, payload: { kind: "save", ...parsed.data } },
  });
}

/** Adds a saved meal's foods to a meal. */
export async function logSavedMealAction(draft: LogSavedMealDraft): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = logSavedMealSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: new SavedMealNotFoundError().message };
  const { submissionKey, eatenOn, meal, savedMealId } = parsed.data;
  return change(user, (tx) => logSavedMeal(tx, user.id, savedMealId, { eatenOn, meal }), {
    eatenOn,
    receipt: { key: submissionKey, payload: { kind: "saved", ...parsed.data } },
  });
}

/** Unstars a saved meal. The meals it was added to keep their foods. */
export async function deleteSavedMealAction(savedMealId: string): Promise<FoodActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(savedMealId).success) return { ok: true };
  return change(user, (tx) => deleteSavedMeal(tx, user.id, savedMealId));
}

/** Keeps a new food in My foods without logging it (ADR 0035). */
export async function createLibraryFoodAction(
  draft: CreateLibraryFoodDraft,
): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = createLibraryFoodSchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { submissionKey, food } = parsed.data;
  return change(user, (tx) => createFood(tx, user.id, food), {
    receipt: { key: submissionKey, payload: { kind: "library-food", ...parsed.data } },
  });
}

/**
 * Saves a meal built in My foods, new or changed (ADR 0035). A new one keeps a receipt, so a
 * retry after a lost reply cannot save it twice; saving a changed one again is the same change.
 */
export async function saveLibraryMealAction(
  draft: SaveLibraryMealDraft,
): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = saveLibraryMealSchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { submissionKey, savedMealId, name, items } = parsed.data;
  return change(user, (tx) => saveLibraryMeal(tx, user.id, { id: savedMealId, name, items }), {
    receipt: savedMealId
      ? undefined
      : { key: submissionKey, payload: { kind: "library-meal", ...parsed.data } },
  });
}

/** Corrects a food in My foods, for what is logged from now on. */
export async function updateFoodAction(draft: UpdateFoodDraft): Promise<FoodActionResult> {
  const user = await requireUser();
  const parsed = updateFoodSchema.safeParse(draft);
  if (!parsed.success) return invalid(parsed.error);
  const { foodId, food } = parsed.data;
  return change(user, (tx) => updateFood(tx, user.id, foodId, food));
}

/** Removes a food from My foods. What was logged from it stays. */
export async function deleteFoodAction(foodId: string): Promise<FoodActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(foodId).success) return { ok: true };
  return change(user, (tx) => deleteFood(tx, user.id, foodId));
}
