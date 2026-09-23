"use client";

import { startTransition, useEffect } from "react";

import { refreshScreenAction } from "@/server/actions/refresh";

import { setChangesMade } from "./set-changes";

/** The change count each address was last rendered again for, so no copy is asked for twice. */
const refetchedFor = new Map<string, number>();

/**
 * Renders the screen again when it was rendered before a set this browser has since saved or
 * deleted (ADR 0030). Today, Progress and the finish screen count the open workout's sets, and
 * the browser can show its own older copy of them: for a minute on the tabs, and on Back.
 *
 * Nothing is asked for when the copy is current, which is almost always: a screen opened after
 * the last set was rendered with it.
 */
export function RefreshWhenSetsChange({ seen }: { seen: number }) {
  useEffect(() => {
    const made = setChangesMade();
    const address = `${location.pathname}${location.search}`;
    if (made <= seen || refetchedFor.get(address) === made) return;
    refetchedFor.set(address, made);
    startTransition(async () => {
      try {
        await refreshScreenAction();
      } catch {
        // Offline, the copy stays as it was, as it would have without this. Signed out, the
        // router has already followed the action's redirect to sign-in on its own.
      }
    });
  }, [seen]);
  return null;
}
