"use client";

import { createContext, useContext, type ReactNode } from "react";

import * as actions from "@/server/actions/nutrition";
import type { FoodActionResult } from "@/server/actions/nutrition";

const PREVIEW_MESSAGE = "This is a preview. Changes are not saved.";
const previewChange = async (): Promise<FoodActionResult> => ({
  ok: false,
  error: PREVIEW_MESSAGE,
});

/** Fixture screens can exercise every form without reading or writing a signed-in account. */
const previewActions: typeof actions = {
  createFoodAction: previewChange,
  createLibraryFoodAction: previewChange,
  deleteEntryAction: previewChange,
  deleteFoodAction: previewChange,
  deleteSavedMealAction: previewChange,
  logFoodAction: previewChange,
  logQuickFoodAction: previewChange,
  logSavedMealAction: previewChange,
  readFoodMonthAction: async () => [],
  saveLibraryMealAction: previewChange,
  saveMealAction: previewChange,
  saveTargetsAction: async () => ({ formError: PREVIEW_MESSAGE }),
  updateEntryAction: previewChange,
  updateFoodAction: previewChange,
};

const FoodPreviewContext = createContext(false);

export function FoodPreview({ children }: { children: ReactNode }) {
  return <FoodPreviewContext value>{children}</FoodPreviewContext>;
}

export function useFoodActions() {
  return useContext(FoodPreviewContext) ? previewActions : actions;
}
