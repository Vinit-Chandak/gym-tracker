"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { MissingReferenceDataError, seedUserStarterData } from "@/db/seed/starter";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";

export type StarterDataState = { error?: string; done?: boolean };

/** Creates the signed-in user's gyms, Anytime Fitness equipment and 8-week programme. */
export async function setUpStarterDataAction(
  _previous: StarterDataState,
  _formData: FormData,
): Promise<StarterDataState> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) =>
      seedUserStarterData(tx, { id: user.id, email: user.email }),
    );
  } catch (error) {
    if (error instanceof MissingReferenceDataError) return { error: error.message };
    throw error;
  }
  revalidatePath("/settings");
  return { done: true };
}
