"use client";

import { useSearchParams } from "next/navigation";

/**
 * A choice a screen keeps in its URL (which measure, which group), so reload and Back restore
 * it, changed through the History API so it costs no request: everything it chooses between is
 * already on the page.
 */
export function useUrlChoice<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const params = useSearchParams();
  const raw = params.get(key);
  const value =
    raw !== null && (options as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = (next: T) => {
    const query = new URLSearchParams(window.location.search);
    query.set(key, next);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  };
  return [value, set];
}
