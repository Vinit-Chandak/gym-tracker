"use client";
import { useSyncExternalStore } from "react";
import { countSessionDrafts } from "@/lib/workout-drafts";
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
