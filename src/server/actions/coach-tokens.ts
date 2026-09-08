"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { createCoachToken, revokeCoachToken } from "@/server/repositories/coach-tokens";

export type TokenState = { error?: string; token?: string; expiresAt?: string };
export async function createCoachTokenAction(
  _previous: TokenState,
  form: FormData,
): Promise<TokenState> {
  const user = await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80), days: z.enum(["30", "90", "365"]) })
    .safeParse({ name: form.get("name"), days: form.get("days") });
  if (!parsed.success) return { error: "Enter a name (up to 80 characters) and choose an expiry." };
  try {
    const result = await withUser(getDb(), user.id, (tx) =>
      createCoachToken(tx, user.id, parsed.data.name, Number(parsed.data.days)),
    );
    revalidatePath("/settings/coach");
    return result;
  } catch {
    return {
      error:
        "Could not create a token. Check your connection and that you have fewer than 10 active tokens.",
    };
  }
}

export async function revokeCoachTokenAction(tokenId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tokenId).success) return { error: "Invalid token." };
  try {
    await withUser(getDb(), user.id, (tx) => revokeCoachToken(tx, user.id, tokenId));
    revalidatePath("/settings/coach");
    return {};
  } catch {
    return { error: "Could not revoke the token. Please retry." };
  }
}
