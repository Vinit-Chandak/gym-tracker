"use client";

import { useSyncExternalStore } from "react";

import { parseSetChanges, SET_CHANGES_COOKIE, type SetChange } from "@/lib/set-changes";

/** A year: the stamp must not lapse while a tab that relies on it is still open. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const NONE: readonly SetChange[] = [];
let changes: readonly SetChange[] = NONE;
/** The last stamp written here, so stamps still rise if the cookie could not be set. */
let written = 0;
const listeners = new Set<() => void>();

/** The stamp of the latest set change, which the next request carries to the server. */
export function setChangesMade(): number {
  for (const cookie of document.cookie.split(";")) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === SET_CHANGES_COOKIE) return parseSetChanges(value.join("="));
  }
  return 0;
}

/**
 * Records a set the server has confirmed saving or deleting (ADR 0030): kept here for the screens
 * this tab may show again from its copy, and stamped in the cookie so every later render says it
 * has seen it.
 *
 * The stamp is the time, raised past the cookie's and this tab's last one. A counter alone would
 * start again from one in a tab opened after the cookie was lost (cleared, or expired: Safari
 * keeps a cookie set by a page for seven days), and another tab's older changes would then look
 * newer than every render made since.
 */
export function recordSetChange(change: Omit<SetChange, "stamp">): void {
  const stamp = Math.max(Date.now(), setChangesMade() + 1, written + 1);
  written = stamp;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SET_CHANGES_COOKIE}=${stamp}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  changes = [...changes, { ...change, stamp }];
  for (const listener of listeners) listener();
}

/** Calls `listener` whenever this tab records a set change. */
export function subscribeToSetChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every set change made in this tab, oldest first. */
export function useSetChanges(): readonly SetChange[] {
  return useSyncExternalStore(
    subscribeToSetChanges,
    () => changes,
    () => NONE,
  );
}
