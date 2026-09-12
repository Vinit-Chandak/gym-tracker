"use client";

import { useEffect } from "react";
import { applyAppearance, readStoredAppearance } from "@/lib/appearance";

/** Update browser chrome after hydration, including metadata replaced by navigation. */
export function AppearanceSync() {
  useEffect(() => {
    const sync = () => applyAppearance(readStoredAppearance());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
