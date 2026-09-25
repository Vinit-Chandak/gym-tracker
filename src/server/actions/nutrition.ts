"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { foodTrackingEnabled } from "@/lib/env";
import { requireUser, type SessionUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  createMeal,
  FoodSubmissionConflictError,
  submitFoodOnce,
  deleteMeal,
  deleteSavedMeal,
  logSavedMeal,
  MealNotFoundError,
  SavedMealNotFoundError,
  saveNutritionTargets,
  updateMeal,
} from "@/server/repositories/nutrition";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import {
  issuesByPath,
  mealInputSchema,
  targetsInputSchema,
  type MealDraft,
} from "@/server/validation/nutrition";

/** An outcome, and for a meal the messages to show against the fields they concern. */
export type FoodActionResult =
  { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const SWITCHED_OFF = "Food tracking is not switched on for this account.";

function describe(error: unknown): string {
  if (
    error instanceof MealNotFoundError ||
    error instanceof SavedMealNotFoundError ||
    error instanceof FoodSubmissionConflictError
  ) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/**
 * The signed-in account, when food tracking is on for it (ADR 0032). Every action asks: an
 * action is reachable by a plain POST whether or not any screen offers it, and the switch has
 * to hold there too.
 */
async function foodUser(): Promise<SessionUser | null> {
  const user = await requireUser();
  return foodTrackingEnabled(user.email) ? user : null;
}

/** The day a new meal is eaten on: today, on the account's own clock. */
async function today(user: SessionUser): Promise<string> {
  const profile = await getRequestProfile(user.id, user.email);
  return todayInTimeZone(profile.timeZone);
}

/**
 * Every change here is shown on the Food screen, which is where it was made, and on Today's
 * card. The tabs now prefetch their data, so refresh alone can reuse an old Today snapshot.
 * Invalidate both paths after a successful write to update Food and discard that prefetch.
 */
function refreshFood(): void {
  revalidatePath("/today");
  revalidatePath("/today/food");
}

export async function saveTargetsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await foodUser();
  if (!user) return { formError: SWITCHED_OFF, values: formValues(formData) };
  const parsed = parseForm(targetsInputSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, (tx) => saveNutritionTargets(tx, user.id, parsed.data));
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  refreshFood();
  return {};
}

/** Logs a new meal for today, or rewrites the one being edited. */
export async function saveMealAction(draft: MealDraft): Promise<FoodActionResult> {
  const user = await foodUser();
  if (!user) return { ok: false, error: SWITCHED_OFF };
  const parsed = mealInputSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, fieldErrors: issuesByPath(parsed.error.issues) };
  const { mealId, submissionKey, eatenOn: draftDay, ...meal } = parsed.data;
  try {
    const currentDay = await today(user);
    const eatenOn = draftDay ?? currentDay;
    if (eatenOn > currentDay)
      return { ok: false, error: "A meal cannot be logged for a future day." };
    await withUser(getDb(), user.id, async (tx) => {
      const write = () =>
        mealId ? updateMeal(tx, user.id, mealId, meal) : createMeal(tx, user.id, eatenOn, meal);
      if (submissionKey)
        await submitFoodOnce(tx, user.id, submissionKey, { mealId, eatenOn, ...meal }, write);
      else await write();
    });
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  refreshFood();
  return { ok: true };
}

/** Deleting a meal that is already gone succeeds: gone is what was asked for. */
export async function deleteMealAction(mealId: string): Promise<FoodActionResult> {
  const user = await foodUser();
  if (!user) return { ok: false, error: SWITCHED_OFF };
  if (!z.uuid().safeParse(mealId).success) return { ok: true };
  try {
    await withUser(getDb(), user.id, (tx) => deleteMeal(tx, user.id, mealId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  refreshFood();
  return { ok: true };
}

/** One tap on a starred meal: the same foods, logged as a meal of today's. */
export async function logSavedMealAction(savedMealId: string): Promise<FoodActionResult> {
  const user = await foodUser();
  if (!user) return { ok: false, error: SWITCHED_OFF };
  if (!z.uuid().safeParse(savedMealId).success) {
    return { ok: false, error: new SavedMealNotFoundError().message };
  }
  try {
    const eatenOn = await today(user);
    await withUser(getDb(), user.id, (tx) => logSavedMeal(tx, user.id, savedMealId, eatenOn));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  refreshFood();
  return { ok: true };
}

/** Unstars a meal. Meals already logged from it stay as they are. */
export async function deleteSavedMealAction(savedMealId: string): Promise<FoodActionResult> {
  const user = await foodUser();
  if (!user) return { ok: false, error: SWITCHED_OFF };
  if (!z.uuid().safeParse(savedMealId).success) return { ok: true };
  try {
    await withUser(getDb(), user.id, (tx) => deleteSavedMeal(tx, user.id, savedMealId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  refreshFood();
  return { ok: true };
}
