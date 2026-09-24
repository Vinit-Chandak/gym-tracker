"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { refreshScreenAction } from "@/server/actions/refresh";

import { setChangesMade, subscribeToSetChanges } from "./set-changes";

/** Copies rendered again, by address and stamp: each is asked for once, then settles. */
const renderedAgain = new Map<string, "asked" | "settled">();
const settleListeners = new Set<() => void>();

function subscribeToSettled(listener: () => void) {
  settleListeners.add(listener);
  return () => {
    settleListeners.delete(listener);
  };
}

/**
 * Shows the screen only when it was rendered after this browser's latest set change (ADR 0030).
 *
 * Today, Progress and the finish screen count the open workout's sets, and the browser can bring
 * back its own copy of them made before the latest set: for a minute on the tabs, and on Back.
 * Such a copy is not shown, so none of its numbers or buttons can be acted on. The screen's own
 * loading state stands in while the screen is rendered again, once, as it would while any screen
 * loads; `refreshScreenAction` keeps the browser's prefetched links, where `router.refresh()`
 * would throw them all away. A copy that cannot be rendered again, offline say, is shown as it is.
 */
export function FreshAfterSets({
  seen,
  loading,
  children,
}: {
  /** The stamp of the latest set change the request for this render carried. */
  seen: number;
  /** The screen's loading state, shown in place of an older copy. */
  loading: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // While hydrating, the page is the server's own render, made with the stamp its request carried.
  const made = useSyncExternalStore(subscribeToSetChanges, setChangesMade, () => seen);
  const key = `${pathname}?${search} ${made}`;
  const state = useSyncExternalStore(
    subscribeToSettled,
    () => renderedAgain.get(key),
    () => undefined,
  );
  const older = made > seen;

  useEffect(() => {
    if (!older || renderedAgain.has(key)) return;
    renderedAgain.set(key, "asked");
    startTransition(async () => {
      try {
        await refreshScreenAction();
      } catch {
        // Offline, the copy is shown as it is. Signed out, the router has already followed the
        // action's redirect to sign-in.
      }
      renderedAgain.set(key, "settled");
      for (const listener of settleListeners) listener();
    });
  }, [key, older]);

  return older && state !== "settled" ? loading : children;
}
