"use client";
import { attempted } from "@/lib/offline-submit";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Retain controlled drafts on a dropped response, while preserving Next's auth redirects. */
export async function coachingAction<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
  const outcome = await attempted(
    action,
    "Connection lost. Your inputs are still here. Check the saved result before retrying.",
  );
  return outcome.ok ? outcome.value : { ok: false, error: outcome.message };
}
