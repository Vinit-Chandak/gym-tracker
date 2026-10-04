"use client";
import { useMemo, useSyncExternalStore } from "react";
import { countSessionDrafts, sessionDraftExercises } from "@/lib/workout-drafts";
function subscribe(listener: () => void) {
  window.addEventListener("overload:drafts", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("overload:drafts", listener);
    window.removeEventListener("storage", listener);
  };
}
export function useSessionDrafts(userId: string, sessionId: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return countSessionDrafts(localStorage, userId, sessionId);
      } catch {
        return 0;
      }
    },
    () => 0,
  );
}
/** Which of the session's exercises hold the drafts, by workout exercise id. */
export function useSessionDraftExercises(userId: string, sessionId: string): readonly string[] {
  // Read as one string, so the snapshot is the same value until the drafts change.
  const joined = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionDraftExercises(localStorage, userId, sessionId).join(" ");
      } catch {
        return "";
      }
    },
    () => "",
  );
  return useMemo(() => (joined === "" ? [] : joined.split(" ")), [joined]);
}
