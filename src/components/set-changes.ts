"use client";

import { useSyncExternalStore } from "react";

import { parseSetChanges, SET_CHANGES_COOKIE, type SetChange } from "@/lib/set-changes";

/** A year: the count must not lapse while a tab that relies on it is still open. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const NONE: readonly SetChange[] = [];
let changes: readonly SetChange[] = NONE;
/** The last count written here, so the count still rises if the cookie could not be set. */
let written = 0;
const listeners = new Set<() => void>();

/** The change count the next request will carry to the server. */
export function setChangesMade(): number {
  for (const cookie of document.cookie.split(";")) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === SET_CHANGES_COOKIE) return parseSetChanges(value.join("="));
  }
  return 0;
}

/**
 * Records a set the server has confirmed saving or deleting (ADR 0030): kept here for the screens
 * this tab may show again from its copy, and counted in the cookie so every later render says it
 * has seen it.
 */
export function recordSetChange(change: Omit<SetChange, "count">): void {
  const count = Math.max(setChangesMade(), written) + 1;
  written = count;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SET_CHANGES_COOKIE}=${count}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  changes = [...changes, { ...change, count }];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every set change made in this tab, oldest first. */
export function useSetChanges(): readonly SetChange[] {
  return useSyncExternalStore(
    subscribe,
    () => changes,
    () => NONE,
  );
}
